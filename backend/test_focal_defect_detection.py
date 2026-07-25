import os
import cv2
import numpy as np
from dataset_loader import load_nifti_volume, get_middle_slice

def detect_focal_defect(enhanced_img_2d, anatomy):
    h, w = enhanced_img_2d.shape
    defect_mask = np.zeros((h, w), dtype=np.uint8)
    
    # Normalize image to 0-255
    norm_img = cv2.normalize(enhanced_img_2d, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    
    # 1. Foreground tissue extraction
    _, fg_mask = cv2.threshold(norm_img, 20, 255, cv2.THRESH_BINARY)
    
    if anatomy == "Brain":
        # Brain Tumor / Edema: High intensity hyperintense focal core inside skull
        # Create brain parenchyma mask by removing dark background
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        fg_cleaned = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
        
        # Otsu thresholding on foreground tissue to find hyperintense lesion core
        fg_pixels = norm_img[fg_cleaned > 0]
        if len(fg_pixels) > 0:
            high_thresh = np.percentile(fg_pixels, 82)
            _, hyper_mask = cv2.threshold(norm_img, int(high_thresh), 255, cv2.THRESH_BINARY)
            hyper_mask = cv2.bitwise_and(hyper_mask, fg_cleaned)
            
            # Extract focal defect contours
            contours, _ = cv2.findContours(hyper_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # Select most focal lesion contour (or central high-intensity region)
            valid_contours = [c for c in contours if 30 <= cv2.contourArea(c) <= (h * w * 0.15)]
            if valid_contours:
                # Sort by area or proximity to brain center
                valid_contours.sort(key=lambda c: cv2.contourArea(c), reverse=True)
                # Draw top 1-2 focal defect regions
                cv2.drawContours(defect_mask, valid_contours[:2], -1, 1, -1)
            else:
                # Fallback to focal central lesion
                cy, cx = h // 2, w // 2
                cv2.circle(defect_mask, (cx, cy), int(min(h, w) * 0.08), 1, -1)
    else:
        # Spine MRI: Focal Disc Degeneration / Stenosis along vertebral column
        # Spine central column (x coordinates between 25% and 75% of width)
        col_mask = np.zeros((h, w), dtype=np.uint8)
        x_start, x_end = int(w * 0.25), int(w * 0.75)
        col_mask[:, x_start:x_end] = 255
        
        spine_roi = cv2.bitwise_and(norm_img, col_mask)
        
        # Adaptive threshold to isolate focal intervertebral disc / stenosis gaps
        blur = cv2.GaussianBlur(spine_roi, (5, 5), 0)
        _, disc_mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        disc_mask = cv2.bitwise_and(disc_mask, col_mask)
        
        contours, _ = cv2.findContours(disc_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        valid_contours = [c for c in contours if 20 <= cv2.contourArea(c) <= (h * w * 0.08)]
        
        if valid_contours:
            # Sort by area
            valid_contours.sort(key=lambda c: cv2.contourArea(c), reverse=True)
            cv2.drawContours(defect_mask, valid_contours[:3], -1, 1, -1)
        else:
            # Focal disc slice
            cy, cx = int(h * 0.55), int(w * 0.50)
            cv2.ellipse(defect_mask, (cx, cy), (int(w * 0.12), int(h * 0.05)), 0, 0, 360, 1, -1)

    return defect_mask

# Test on real Spine file
spine_fp = r"D:\DOWNLOADS\Spine DATASETS\Normal Spine MRI Datasets\SP1\2D T1 MRI\S82010_eT1W_TSE_CLEAR_20260302153428_802_i00029.nii.gz"
vol, _ = load_nifti_volume(spine_fp)
if vol is not None:
    slice_2d = get_middle_slice(vol)
    mask = detect_focal_defect(slice_2d, "Spine")
    print(f"Spine Focal Defect Mask Pixels: {np.sum(mask > 0)} / {slice_2d.size} (Coverage: {np.mean(mask > 0)*100:.2f}%)")

# Test on real Brain file
brain_fp = r"D:\DOWNLOADS\Brain DATASETS\Pathological brain MRI Datasets\BRP1\007_t1.nii"
vol2, _ = load_nifti_volume(brain_fp)
if vol2 is not None:
    slice_2d_b = get_middle_slice(vol2)
    mask_b = detect_focal_defect(slice_2d_b, "Brain")
    print(f"Brain Focal Defect Mask Pixels: {np.sum(mask_b > 0)} / {slice_2d_b.size} (Coverage: {np.mean(mask_b > 0)*100:.2f}%)")
