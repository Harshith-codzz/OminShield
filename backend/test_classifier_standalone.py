import os
import glob
import cv2
import numpy as np
import nibabel as nib
from dataset_loader import load_nifti_volume, get_middle_slice
from anatomy_classifier import classifier_instance

spine_dir = r"D:\DOWNLOADS\Spine DATASETS"
brain_dir = r"D:\DOWNLOADS\Brain DATASETS"

print("--- TESTING SPINE DATASET FILES ---")
spine_files = []
for root, _, files in os.walk(spine_dir):
    for f in files:
        if f.endswith(('.nii', '.nii.gz', '.png', '.jpg', '.jpeg')):
            spine_files.append(os.path.join(root, f))

for fp in spine_files[:10]:
    vol, _ = load_nifti_volume(fp)
    if vol is not None:
        slice_2d = get_middle_slice(vol)
        res = classifier_instance.classify_slice(slice_2d, filename_hint=os.path.basename(fp))
        print(f"File: {os.path.basename(fp)[:45]:45s} -> Classified: {res['anatomy']} (Conf: {res['confidence']})")

print("\n--- TESTING BRAIN DATASET FILES ---")
brain_files = []
for root, _, files in os.walk(brain_dir):
    for f in files:
        if f.endswith(('.nii', '.nii.gz', '.png', '.jpg', '.jpeg')):
            brain_files.append(os.path.join(root, f))

for fp in brain_files[:10]:
    vol, _ = load_nifti_volume(fp)
    if vol is not None:
        slice_2d = get_middle_slice(vol)
        res = classifier_instance.classify_slice(slice_2d, filename_hint=os.path.basename(fp))
        print(f"File: {os.path.basename(fp)[:45]:45s} -> Classified: {res['anatomy']} (Conf: {res['confidence']})")
