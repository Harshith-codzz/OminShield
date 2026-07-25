import urllib.request
import json
import os

def test_upload(filepath):
    print(f"--- Testing upload of {os.path.basename(filepath)} ---")
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    with open(filepath, 'rb') as f:
        file_data = f.read()

    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(filepath)}"\r\n'
        f'Content-Type: application/octet-stream\r\n\r\n'
    ).encode('utf-8') + file_data + f'\r\n--{boundary}--\r\n'.encode('utf-8')

    req = urllib.request.Request('http://localhost:8000/api/analyze', data=body)
    req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')

    try:
        resp = urllib.request.urlopen(req)
        res = json.loads(resp.read().decode('utf-8'))
        print("[SUCCESS] API Response Summary:")
        print("1. Anatomy Classification:", res.get("classify"))
        print("2. Enhancement Candidate:", res.get("enhance"))
        print("3. Quality Scores:", res.get("score"))
        print("4. ROI Segmentation:", res.get("segment"))
        print("5. Evaluation Matrix:", res.get("metrics"))
        print("-" * 50)
    except Exception as e:
        print("[ERROR] testing upload:", e)

if __name__ == "__main__":
    spine_file = r"D:\DOWNLOADS\Spine DATASETS\Pathological Spine MRI Datasets\SP11\S82028_T1W_TSE_sag_20260304103521_501.nii.gz"
    brain_file = r"D:\DOWNLOADS\Brain DATASETS\Pathological brain MRI Datasets\BRP1\007_t1.nii"
    
    if os.path.exists(spine_file):
        test_upload(spine_file)
    if os.path.exists(brain_file):
        test_upload(brain_file)
