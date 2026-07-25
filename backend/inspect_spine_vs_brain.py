import os
import cv2
import numpy as np
from dataset_loader import load_nifti_volume, get_middle_slice

spine_dir = r"D:\DOWNLOADS\Spine DATASETS"
brain_dir = r"D:\DOWNLOADS\Brain DATASETS"

spine_fps = []
for root, _, files in os.walk(spine_dir):
    for f in files:
        if f.endswith(('.nii', '.nii.gz')):
            spine_fps.append(os.path.join(root, f))

brain_fps = []
for root, _, files in os.walk(brain_dir):
    for f in files:
        if f.endswith(('.nii', '.nii.gz')):
            brain_fps.append(os.path.join(root, f))

print("=== SPINE SLICE PROPERTIES ===")
for fp in spine_fps[:10]:
    vol, _ = load_nifti_volume(fp)
    if vol is not None:
        slice_2d = get_middle_slice(vol)
        if slice_2d.ndim == 3:
            slice_2d = slice_2d[:, :, 0]
        h, w = slice_2d.shape
        # Compute horizontal vs vertical gradient ratio
        gx = cv2.Sobel(slice_2d, cv2.CV_64F, 1, 0, ksize=3)
        gy = cv2.Sobel(slice_2d, cv2.CV_64F, 0, 1, ksize=3)
        grad_x_mean = np.mean(np.abs(gx))
        grad_y_mean = np.mean(np.abs(gy))
        grad_ratio = grad_x_mean / (grad_y_mean + 1e-5)
        # Background ratio (black pixels around edge)
        border_pixels = np.concatenate([slice_2d[0, :], slice_2d[-1, :], slice_2d[:, 0], slice_2d[:, -1]])
        border_mean = np.mean(border_pixels)
        print(f"Spine: {os.path.basename(fp)[:35]:35s} | Shape: {h}x{w} | Grad Ratio (X/Y): {grad_ratio:.2f} | Border Mean: {border_mean:.1f} | Path: {'Spine' in fp}")

print("\n=== BRAIN SLICE PROPERTIES ===")
for fp in brain_fps[:10]:
    vol, _ = load_nifti_volume(fp)
    if vol is not None:
        slice_2d = get_middle_slice(vol)
        if slice_2d.ndim == 3:
            slice_2d = slice_2d[:, :, 0]
        h, w = slice_2d.shape
        gx = cv2.Sobel(slice_2d, cv2.CV_64F, 1, 0, ksize=3)
        gy = cv2.Sobel(slice_2d, cv2.CV_64F, 0, 1, ksize=3)
        grad_x_mean = np.mean(np.abs(gx))
        grad_y_mean = np.mean(np.abs(gy))
        grad_ratio = grad_x_mean / (grad_y_mean + 1e-5)
        border_pixels = np.concatenate([slice_2d[0, :], slice_2d[-1, :], slice_2d[:, 0], slice_2d[:, -1]])
        border_mean = np.mean(border_pixels)
        print(f"Brain: {os.path.basename(fp)[:35]:35s} | Shape: {h}x{w} | Grad Ratio (X/Y): {grad_ratio:.2f} | Border Mean: {border_mean:.1f} | Path: {'Brain' in fp}")
