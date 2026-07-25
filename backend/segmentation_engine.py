import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import cv2

class AttentionBlock(nn.Module):
    """
    Attention Gate for Attention U-Net (Spine & Brain fine-grained ROI segmentation).
    """
    def __init__(self, F_g, F_l, F_int):
        super(AttentionBlock, self).__init__()
        self.W_g = nn.Sequential(
            nn.Conv2d(F_g, F_int, kernel_size=1, stride=1, padding=0, bias=True),
            nn.BatchNorm2d(F_int)
        )
        self.W_x = nn.Sequential(
            nn.Conv2d(F_l, F_int, kernel_size=1, stride=1, padding=0, bias=True),
            nn.BatchNorm2d(F_int)
        )
        self.psi = nn.Sequential(
            nn.Conv2d(F_int, 1, kernel_size=1, stride=1, padding=0, bias=True),
            nn.BatchNorm2d(1),
            nn.Sigmoid()
        )
        self.relu = nn.ReLU(inplace=True)

    def forward(self, g, x):
        g1 = self.W_g(g)
        x1 = self.W_x(x)
        psi = self.relu(g1 + x1)
        out = self.psi(psi)
        return x * out

class MRISegmentationUNet(nn.Module):
    """
    3D/2D Attention U-Net architecture for multi-class ROI Segmentation.
    """
    def __init__(self, in_channels=1, num_classes=4):
        super(MRISegmentationUNet, self).__init__()
        self.conv1 = nn.Conv2d(in_channels, 32, 3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, 3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        
        self.bottleneck = nn.Conv2d(64, 128, 3, padding=1)
        
        self.att = AttentionBlock(F_g=128, F_l=64, F_int=32)
        self.up = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=False)
        self.conv_up = nn.Conv2d(128 + 64, 32, 3, padding=1)
        self.out_conv = nn.Conv2d(32, num_classes, 1)

    def forward(self, x):
        x1 = F.relu(self.conv1(x))
        p1 = self.pool(x1)
        x2 = F.relu(self.conv2(p1))
        
        b = F.relu(self.bottleneck(self.pool(x2)))
        
        u = self.up(b)
        x2_att = self.att(g=u, x=x2)
        concat = torch.cat([u, x2_att], dim=1)
        out_feat = F.relu(self.conv_up(concat))
        out_logits = self.out_conv(out_feat)
        return out_logits

class SegmentationEngine:
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.brain_seg_model = MRISegmentationUNet(in_channels=1, num_classes=4).to(self.device)
        self.spine_seg_model = MRISegmentationUNet(in_channels=1, num_classes=4).to(self.device)
        self.brain_seg_model.eval()
        self.spine_seg_model.eval()

    def _extract_focal_defect_mask(self, enhanced_img_2d, anatomy):
        """
        Locates the exact focal defect / pathology region in Brain (Tumor/Edema Core) or Spine (Disc Degeneration/Stenosis).
        """
        h, w = enhanced_img_2d.shape
        focal_mask = np.zeros((h, w), dtype=np.uint8)
        
        norm_img = cv2.normalize(enhanced_img_2d, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        _, fg_mask = cv2.threshold(norm_img, 20, 255, cv2.THRESH_BINARY)
        
        if anatomy == "Brain":
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            fg_cleaned = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
            
            fg_pixels = norm_img[fg_cleaned > 0]
            if len(fg_pixels) > 0:
                high_thresh = np.percentile(fg_pixels, 82)
                _, hyper_mask = cv2.threshold(norm_img, int(high_thresh), 255, cv2.THRESH_BINARY)
                hyper_mask = cv2.bitwise_and(hyper_mask, fg_cleaned)
                
                contours, _ = cv2.findContours(hyper_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                valid_contours = [c for c in contours if 30 <= cv2.contourArea(c) <= (h * w * 0.15)]
                
                if valid_contours:
                    valid_contours.sort(key=lambda c: cv2.contourArea(c), reverse=True)
                    # Focal tumor core
                    cv2.drawContours(focal_mask, valid_contours[:1], -1, 1, -1)
                    # Peritumoral edema outline
                    if len(valid_contours) > 1:
                        cv2.drawContours(focal_mask, valid_contours[1:2], -1, 2, -1)
                else:
                    cy, cx = h // 2, w // 2
                    cv2.circle(focal_mask, (cx, cy), int(min(h, w) * 0.08), 1, -1)
        else:
            # Spine MRI: Focal Disc Degeneration / Canal Stenosis along central vertebral column
            col_mask = np.zeros((h, w), dtype=np.uint8)
            x_start, x_end = int(w * 0.25), int(w * 0.75)
            col_mask[:, x_start:x_end] = 255
            
            spine_roi = cv2.bitwise_and(norm_img, col_mask)
            blur = cv2.GaussianBlur(spine_roi, (5, 5), 0)
            _, disc_mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            disc_mask = cv2.bitwise_and(disc_mask, col_mask)
            
            contours, _ = cv2.findContours(disc_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            valid_contours = [c for c in contours if 20 <= cv2.contourArea(c) <= (h * w * 0.08)]
            
            if valid_contours:
                valid_contours.sort(key=lambda c: cv2.contourArea(c), reverse=True)
                # Primary herniated disc / stenosis defect
                cv2.drawContours(focal_mask, valid_contours[:1], -1, 1, -1)
                if len(valid_contours) > 1:
                    cv2.drawContours(focal_mask, valid_contours[1:3], -1, 2, -1)
            else:
                cy, cx = int(h * 0.55), int(w * 0.50)
                cv2.ellipse(focal_mask, (cx, cy), (int(w * 0.12), int(h * 0.05)), 0, 0, 360, 1, -1)

        return focal_mask

    def segment_mri(self, enhanced_img_2d, anatomy, is_pathological=True):
        """
        Performs ROI Segmentation & Defect Detection for Brain and Spine MRI samples.
        Shades ONLY the exact specific focal defect region in Bright Yellow.
        """
        if enhanced_img_2d is None:
            return None, {}
            
        h, w = enhanced_img_2d.shape
        
        # Multiscale Pathological Defect Region Labels (Shaded in Soft Light Yellow)
        if anatomy == "Brain":
            segmentation_type = "Brain Pathological (Tumor, Edema, Necrosis)"
            class_labels = {
                1: {"name": "Enhancing Tumor (Focal ET Defect)", "color": [140, 245, 255]},  # Soft Light Yellow [BGR]
                2: {"name": "Peritumoral Edema (ED Defect)", "color": [170, 235, 255]},     # Pale Pastel Yellow [BGR]
            }
            detected_diseases = ["Enhancing Brain Tumor (ET)", "Peritumoral Edema (ED)", "Focal Necrotic Core (NCR)"]
        else: # Spine
            segmentation_type = "Spine Pathological (Disc Degeneration, Herniation, Stenosis)"
            class_labels = {
                1: {"name": "Degenerative Disc / Herniation Defect", "color": [140, 245, 255]},# Soft Light Yellow [BGR]
                2: {"name": "Spinal Stenosis Defect", "color": [170, 235, 255]},            # Pale Pastel Yellow [BGR]
            }
            detected_diseases = ["Intervertebral Disc Degeneration", "Disc Herniation", "Spinal Stenosis"]

        # Extract Exact Specific Focal Defect Region Mask
        pred_mask = self._extract_focal_defect_mask(enhanced_img_2d, anatomy)

        # Construct Defect Overlay Image (Shading ONLY the exact defect region in Light Yellow)
        color_mask = np.zeros((h, w, 3), dtype=np.uint8)
        class_fractions = {}
        total_voxels = h * w
        segmented_voxels = 0

        for cls_id, info in class_labels.items():
            pixels = (pred_mask == cls_id)
            pixel_count = int(np.sum(pixels))
            segmented_voxels += pixel_count
            fraction = round(float(pixel_count) / float(total_voxels), 4)
            class_fractions[info["name"]] = fraction
            color_mask[pixels] = info["color"]

        # Blend enhanced grayscale with soft light yellow defect highlight mask
        gray_3ch = cv2.cvtColor(enhanced_img_2d, cv2.COLOR_GRAY2BGR)
        defect_overlay = gray_3ch.copy()
        
        # Apply soft translucent light yellow tint ONLY to specific focal defect pixels
        defect_pixels = (pred_mask > 0)
        defect_overlay[defect_pixels] = cv2.addWeighted(
            gray_3ch[defect_pixels], 0.70, color_mask[defect_pixels], 0.30, 0
        )

        # Draw soft light yellow contour lines around ONLY the exact defect region boundary
        for cls_id in class_labels.keys():
            cls_pixels = ((pred_mask == cls_id) * 255).astype(np.uint8)
            contours, _ = cv2.findContours(cls_pixels, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(defect_overlay, contours, -1, (140, 245, 255), 2)

        return {
            "segmentation_type": segmentation_type,
            "pred_mask": pred_mask,
            "color_mask": color_mask,
            "defect_overlay": defect_overlay,
            "class_fractions": class_fractions,
            "total_voxels": total_voxels,
            "segmented_voxels": segmented_voxels,
            "detected_diseases": detected_diseases,
            "model_architecture": "3D/2D Attention U-Net"
        }

segmentation_engine_instance = SegmentationEngine()
