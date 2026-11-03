"""Real inference on a bundled public image, without camera access or provider calls."""
import hashlib
import json
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
os.environ.setdefault("YOLO_CONFIG_DIR",str(ROOT/".comparator-cache/settings"))
(ROOT/".comparator-cache/settings/Ultralytics").mkdir(parents=True,exist_ok=True)
import torch
import ultralytics
from ultralytics import YOLO, RTDETR
from ultralytics.utils import ASSETS
from PIL import Image
from custom_world_detection import SavedWorldAdapter, CustomVocabularyDetector

torch.set_num_threads(2)
folder=ROOT/"downloads/custom-model"
if not (folder/"custom_labels.json").is_file():folder=ROOT/"models"
(ROOT/".comparator-cache/weights").mkdir(parents=True,exist_ok=True)
metadata=folder/"custom_labels.json";meta=json.loads(metadata.read_text(encoding="utf-8"))
adapter=SavedWorldAdapter(folder/"yoloworld_custom.safetensors",metadata,meta["weights_sha256"],hashlib.sha256(metadata.read_bytes()).hexdigest())
detector=CustomVocabularyDetector(YOLO(str(ROOT/".comparator-cache/weights/yolov8n.pt")),RTDETR(str(ROOT/".comparator-cache/weights/rtdetr-l.pt")),adapter)
with Image.open(Path(ASSETS)/"bus.jpg") as opened:image=opened.convert("RGB")
image.thumbnail((960,720))
batch,encoded=detector(image)
assert detector.status()["custom_ready"] and detector.status()["comparator_ready"]
assert len(adapter.names)==61 and len(detector.primary.names)==80
assert batch.comparison["custom"] and encoded
assert batch.comparison["primary_retained_count"]==len(batch.comparison["primary"])
for original,kept in zip(batch.comparison["primary"],batch):
    assert kept["label"]==original["label"] and kept["bbox_xyxy"]==original["bbox_xyxy"]
    assert kept["yolo_confidence"]==original["confidence"] and kept["confidence"]>=original["confidence"]
json.dumps(batch.comparison,allow_nan=False)
(folder/"MODEL-CLASS-MAP.json").write_text(json.dumps(detector.names,indent=2),encoding="utf-8")
report={"real_cpu_inference_passed":True,"custom_labels":len(adapter.names),"combined_classes":len(detector.names),
        "policy":batch.comparison["policy"],"torch":torch.__version__,"ultralytics":ultralytics.__version__,
        "primary_predictions":len(batch.comparison["primary"]),"primary_retained":batch.comparison["primary_retained_count"],
        "all_primary_labels_boxes_scores_preserved":True,
        "custom_predictions":len(batch.comparison["custom"]),"combined_predictions":len(batch),
        "sample":"Bundled public Ultralytics bus.jpg; no ground-truth accuracy claim",
        "note":"No camera or paid provider call. GPU and physical-camera performance have not been verified."}
(folder/"SMOKE-VERIFICATION.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
