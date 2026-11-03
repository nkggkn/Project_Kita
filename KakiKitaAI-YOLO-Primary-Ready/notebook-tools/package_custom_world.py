"""Package the ready notebook, checked data-only weights, labels, sources and references."""
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
names=["custom_world_detection.py","comparator_detection.py","comparator_evaluation.py",
       "create_custom_world_notebook.py","create_comparator_notebook.py","convert_custom_world.py",
       "smoke_custom_world.py","test_custom_world.py","test_comparator.py","phone_relay_api.py",
       "live_streaming.py","live_api.py","test_phone_relay.py","test_live_streaming.py","package_custom_world.py",
       "CUSTOM-LABELS-START-HERE.md"]
entries={"notebook-tools/"+name:(ROOT/"notebook-tools"/name).read_bytes() for name in names}
for name in ["KakiKitaAI_YOLO_Primary_Colab.ipynb","KakiKitaAI_Custom_Labels_Colab.ipynb","KakiKitaAI_Comparator_Colab.ipynb",
             "KakiKitaAI_Tapo_C200_Colab.ipynb","KakiKitaAI_Combined_Mobile_Webcam.ipynb"]:
    data=(ROOT/"downloads"/name).read_bytes()
    book=json.loads(data)
    assert all(not c.get("outputs") and c.get("execution_count") is None for c in book["cells"] if c["cell_type"]=="code")
    entries["downloads/"+name]=data
entries["KakiKitaAI_Custom_Labels_Colab.ipynb"]=entries["downloads/KakiKitaAI_Custom_Labels_Colab.ipynb"]
entries["KakiKitaAI_YOLO_Primary_Colab.ipynb"]=entries["downloads/KakiKitaAI_YOLO_Primary_Colab.ipynb"]
entries["START-HERE.md"]=entries["notebook-tools/CUSTOM-LABELS-START-HERE.md"]
folder=ROOT/"downloads/custom-model"
if not (folder/"custom_labels.json").is_file():folder=ROOT/"models"
meta=json.loads((folder/"custom_labels.json").read_text(encoding="utf-8"))
assert len(meta["labels"])==61
assert hashlib.sha256((folder/"yoloworld_custom.safetensors").read_bytes()).hexdigest()==meta["weights_sha256"]
for name in ["yoloworld_custom.safetensors","custom_labels.json","MODEL-CLASS-MAP.json","SMOKE-VERIFICATION.json"]:
    entries["models/"+name]=(folder/name).read_bytes()
entries["requirements.txt"]=b"ultralytics==8.4.198\nsafetensors==0.8.0\nanthropic\nfastapi\nhttpx\nuvicorn\npython-multipart\npillow\nnest-asyncio\npyngrok\nrequests\nopencv-python-headless\nyt-dlp[default]\ndeno\nnbformat\npytest\n"
for name,data in entries.items():
    if not name.endswith(".safetensors"):
        assert not re.search(rb"sk-ant-[A-Za-z0-9_-]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",data),name
manifest={name:hashlib.sha256(data).hexdigest() for name,data in entries.items()}
entries["MANIFEST.json"]=(json.dumps(manifest,indent=2)+"\n").encode()
output=ROOT/"downloads/KakiKitaAI-YOLO-Primary-Ready.zip"
with zipfile.ZipFile(output,"w",compression=zipfile.ZIP_DEFLATED) as archive:
    for name,data in sorted(entries.items()):archive.writestr(name,data)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    for name,digest in manifest.items():assert hashlib.sha256(archive.read(name)).hexdigest()==digest
shutil.copyfile(output,ROOT/"downloads/KakiKitaAI-Custom-Labels-Ready.zip")
print(f"Created {output.name}: {len(entries)} files, {output.stat().st_size:,} bytes; model and ZIP hashes verified.")
