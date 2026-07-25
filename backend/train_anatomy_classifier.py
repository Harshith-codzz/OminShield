import os
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
import numpy as np
import cv2
from dataset_loader import load_nifti_volume, get_middle_slice
from anatomy_classifier import MRIAnatomyCNN

spine_dir = r"D:\DOWNLOADS\Spine DATASETS"
brain_dir = r"D:\DOWNLOADS\Brain DATASETS"

print("Building training dataset from local Spine and Brain files...")

X_samples = []
y_labels = [] # 0: Brain, 1: Spine

# Load Spine slices
spine_fps = []
for root, _, files in os.walk(spine_dir):
    for f in files:
        if f.endswith(('.nii', '.nii.gz')):
            spine_fps.append(os.path.join(root, f))

print(f"Found {len(spine_fps)} Spine files. Extracting 2D training slices...")
for fp in spine_fps:
    vol, _ = load_nifti_volume(fp)
    if vol is not None:
        slice_2d = get_middle_slice(vol)
        if slice_2d is not None:
            if slice_2d.ndim == 3:
                slice_2d = slice_2d[:, :, 0]
            resized = cv2.resize(slice_2d, (128, 128)).astype(np.float32) / 255.0
            X_samples.append(resized)
            y_labels.append(1) # Spine

# Load Brain slices
brain_fps = []
for root, _, files in os.walk(brain_dir):
    for f in files:
        if f.endswith(('.nii', '.nii.gz')):
            brain_fps.append(os.path.join(root, f))

print(f"Found {len(brain_fps)} Brain files. Extracting 2D training slices...")
for fp in brain_fps:
    vol, _ = load_nifti_volume(fp)
    if vol is not None:
        slice_2d = get_middle_slice(vol)
        if slice_2d is not None:
            if slice_2d.ndim == 3:
                slice_2d = slice_2d[:, :, 0]
            resized = cv2.resize(slice_2d, (128, 128)).astype(np.float32) / 255.0
            X_samples.append(resized)
            y_labels.append(0) # Brain

X_arr = np.array(X_samples, dtype=np.float32)
y_arr = np.array(y_labels, dtype=np.int64)

print(f"Dataset compiled: {len(X_arr)} total slices (Brain: {np.sum(y_arr==0)}, Spine: {np.sum(y_arr==1)}).")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = MRIAnatomyCNN().to(device)
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

X_tensor = torch.tensor(X_arr).unsqueeze(1).to(device)
y_tensor = torch.tensor(y_arr).to(device)

model.train()
print("Training MRIAnatomyCNN model...")
epochs = 25
batch_size = 16
num_samples = len(X_arr)

for epoch in range(epochs):
    permutation = torch.randperm(num_samples)
    epoch_loss = 0.0
    correct = 0
    
    for i in range(0, num_samples, batch_size):
        indices = permutation[i:i+batch_size]
        batch_x, batch_y = X_tensor[indices], y_tensor[indices]
        
        optimizer.zero_grad()
        outputs = model(batch_x)
        loss = criterion(outputs, batch_y)
        loss.backward()
        optimizer.step()
        
        epoch_loss += loss.item() * len(batch_x)
        preds = torch.argmax(outputs, dim=1)
        correct += torch.sum(preds == batch_y).item()
        
    acc = correct / num_samples
    if (epoch + 1) % 5 == 0 or epoch == epochs - 1:
        print(f"Epoch [{epoch+1}/{epochs}] - Loss: {epoch_loss/num_samples:.4f} - Accuracy: {acc*100:.2f}%")

weights_path = r"d:\Hackathon\backend\mri_anatomy_cnn.pth"
torch.save(model.state_dict(), weights_path)
print(f"Model trained and weights saved successfully to {weights_path}!")
