import os
import glob
import numpy as np
import nibabel as nib
import cv2

BRAIN_DATASET_DIR = r"D:\DOWNLOADS\Brain DATASETS"
SPINE_DATASET_DIR = r"D:\DOWNLOADS\Spine DATASETS"

def load_nifti_volume(filepath):
    """
    Loads a NIfTI volume from file path and returns numpy array normalized to [0, 255].
    Handles both .nii and .nii.gz files safely on Windows.
    """
    try:
        img = nib.load(filepath)
        data = np.asanyarray(img.dataobj, dtype=np.float32)
        header = img.header
        img.uncache()
        min_val, max_val = np.min(data), np.max(data)
        if max_val > min_val:
            data = ((data - min_val) / (max_val - min_val) * 255.0)
        return data, header
    except Exception as e:
        print(f"Error loading {filepath}: {e}")
        return None, None

def get_middle_slice(volume_data, axis=2):
    """
    Extracts the middle 2D slice from a 3D volume data along specified axis.
    """
    if volume_data is None or volume_data.ndim < 2:
        return None
    if volume_data.ndim == 2:
        return volume_data.astype(np.uint8)
    
    idx = volume_data.shape[axis] // 2
    if axis == 0:
        slice_2d = volume_data[idx, :, :]
    elif axis == 1:
        slice_2d = volume_data[:, idx, :]
    else:
        slice_2d = volume_data[:, :, idx]
        
    return slice_2d.astype(np.uint8)

def compute_slice_metrics(slice_2d):
    """
    Calculates key image properties for Stage 1 dataset property assessment:
    - Mean
    - Standard Deviation
    - Contrast (RMS contrast)
    - Sharpness (Laplacian variance)
    - Edge Strength (Sobel magnitude)
    - Noise Level (Std of residual after median filtering)
    - SNR (Signal-to-Noise Ratio)
    """
    if slice_2d is None:
        return {}
    
    slice_float = slice_2d.astype(np.float32)
    mean_val = float(np.mean(slice_float))
    std_val = float(np.std(slice_float))
    
    # RMS Contrast
    contrast = float(np.sqrt(np.mean((slice_float - mean_val) ** 2)))
    
    # Sharpness (Laplacian variance)
    lap = cv2.Laplacian(slice_2d, cv2.CV_64F)
    sharpness = float(np.var(lap))
    
    # Edge Strength (Sobel filter magnitude mean)
    sobelx = cv2.Sobel(slice_2d, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(slice_2d, cv2.CV_64F, 0, 1, ksize=3)
    edge_strength = float(np.mean(np.sqrt(sobelx**2 + sobely**2)))
    
    # Noise Level
    denoised = cv2.medianBlur(slice_2d, 3)
    noise_residual = slice_float - denoised.astype(np.float32)
    noise_level = float(np.std(noise_residual))
    
    # SNR (dB)
    snr = 20 * np.log10(mean_val / (noise_level + 1e-6)) if noise_level > 0 else 30.0
    
    return {
        "mean": round(mean_val, 2),
        "std": round(std_val, 2),
        "contrast": round(contrast, 2),
        "sharpness": round(sharpness, 2),
        "edge_strength": round(edge_strength, 2),
        "noise_level": round(noise_level, 2),
        "snr_db": round(float(snr), 2)
    }

def scan_datasets():
    """
    Scans Brain and Spine dataset directories and compiles dataset statistics.
    """
    stats = {
        "brain": {
            "normal_samples": 0,
            "pathological_samples": 0,
            "modalities": ["T1", "T2", "FLAIR", "T1ce"],
            "files": []
        },
        "spine": {
            "normal_samples": 0,
            "pathological_samples": 0,
            "modalities": ["T1", "T2", "STIR"],
            "files": []
        }
    }
    
    # Brain Normal
    brain_normal_path = os.path.join(BRAIN_DATASET_DIR, "Normal brain Datasets")
    if os.path.exists(brain_normal_path):
        subfolders = [f for f in os.listdir(brain_normal_path) if os.path.isdir(os.path.join(brain_normal_path, f))]
        stats["brain"]["normal_samples"] = len(subfolders)
        for sub in subfolders:
            for root, _, files in os.walk(os.path.join(brain_normal_path, sub)):
                for file in files:
                    if file.endswith(('.nii', '.nii.gz')):
                        stats["brain"]["files"].append(os.path.join(root, file))
                        
    # Brain Pathological
    brain_patho_path = os.path.join(BRAIN_DATASET_DIR, "Pathological brain MRI Datasets")
    if os.path.exists(brain_patho_path):
        subfolders = [f for f in os.listdir(brain_patho_path) if os.path.isdir(os.path.join(brain_patho_path, f))]
        stats["brain"]["pathological_samples"] = len(subfolders)
        for sub in subfolders:
            for root, _, files in os.walk(os.path.join(brain_patho_path, sub)):
                for file in files:
                    if file.endswith(('.nii', '.nii.gz')):
                        stats["brain"]["files"].append(os.path.join(root, file))

    # Spine Normal
    spine_normal_path = os.path.join(SPINE_DATASET_DIR, "Normal Spine MRI Datasets")
    if os.path.exists(spine_normal_path):
        subfolders = [f for f in os.listdir(spine_normal_path) if os.path.isdir(os.path.join(spine_normal_path, f))]
        stats["spine"]["normal_samples"] = len(subfolders)
        for sub in subfolders:
            for root, _, files in os.walk(os.path.join(spine_normal_path, sub)):
                for file in files:
                    if file.endswith(('.nii', '.nii.gz')):
                        stats["spine"]["files"].append(os.path.join(root, file))

    # Spine Pathological
    spine_patho_path = os.path.join(SPINE_DATASET_DIR, "Pathological Spine MRI Datasets")
    if os.path.exists(spine_patho_path):
        subfolders = [f for f in os.listdir(spine_patho_path) if os.path.isdir(os.path.join(spine_patho_path, f))]
        stats["spine"]["pathological_samples"] = len(subfolders)
        for sub in subfolders:
            for root, _, files in os.walk(os.path.join(spine_patho_path, sub)):
                for file in files:
                    if file.endswith(('.nii', '.nii.gz')):
                        stats["spine"]["files"].append(os.path.join(root, file))

    return stats

if __name__ == "__main__":
    s = scan_datasets()
    print("Dataset Scan Summary:")
    print(f"Brain Normal: {s['brain']['normal_samples']}, Pathological: {s['brain']['pathological_samples']}, Total Files: {len(s['brain']['files'])}")
    print(f"Spine Normal: {s['spine']['normal_samples']}, Pathological: {s['spine']['pathological_samples']}, Total Files: {len(s['spine']['files'])}")
