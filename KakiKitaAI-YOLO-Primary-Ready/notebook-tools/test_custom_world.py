"""Custom vocabulary namespace/fusion and app compatibility; no camera or paid calls."""
import hashlib
import io
import json
import sys
import time
from pathlib import Path
import nbformat
import pytest
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(ROOT/".notebook-test-deps"))
from comparator_evaluation import benchmark_directory
from custom_world_detection import CustomVocabularyDetector
from test_comparator import Model, row, fake_engine, jpeg


def custom_model(rows, names=None, fail=False):
    model=Model(rows,fail=fail);model.names=names or {0:"cable",1:"chair"};return model


def test_new_custom_label_is_retained_without_coco_confirmation_or_id_collision():
    primary=Model();detector=CustomVocabularyDetector(primary,Model(),custom_model([row("cable",.7,class_id=0)]))
    batch=detector.compare(Image.new("RGB",(100,80)))
    cable=next(r for r in batch if r["label"]=="cable")
    assert cable["class_id"]==2 and cable["custom_class_id"]==0
    assert cable["agreement"]=="custom_only" and cable["needs_review"] and cable["model_count"]==1
    assert primary.names=={0:"chair",1:"couch"}
    assert batch.comparison["label_disagreements"]==[]


def test_third_model_never_reduces_yolo_score_or_changes_its_geometry():
    a=Model([row(score=.9)]);b=Model([row(score=.5)])
    custom=custom_model([row("chair",.7,class_id=1)])
    batch=CustomVocabularyDetector(a,b,custom).compare(Image.new("RGB",(100,80)))
    assert len(batch)==1 and batch[0]["agreement"]=="all_three"
    assert batch[0]["confidence"]==.9 and batch[0]["model_count"]==3 and not batch[0]["needs_review"]
    assert batch[0]["bbox_xyxy"]==[10,10,50,50]


def test_weak_third_model_cannot_undo_an_existing_support_boost():
    a=Model([row(score=.4)]);b=Model([row(score=.8)])
    custom=custom_model([row("chair",.25,class_id=1)])
    batch=CustomVocabularyDetector(a,b,custom).compare(Image.new("RGB",(100,80)))
    assert batch[0]["confidence"]==pytest.approx(.6)


def test_nearby_same_label_custom_yolo_objects_are_not_suppressed():
    custom=custom_model([row("cable",.25),row("cable",.26,box=(20,10,60,50))])
    batch=CustomVocabularyDetector(Model([]),Model([]),custom).compare(Image.new("RGB",(100,80)))
    assert len(batch)==2 and [r["yolo_confidence"] for r in batch]==[.26,.25]


def test_all_primary_yolo_objects_survive_both_missing_and_conflicting_support():
    originals=[row(score=.25),row("couch",.26,box=(60,10,90,50),class_id=1)]
    detector=CustomVocabularyDetector(Model(originals),Model([row("couch",.99,class_id=1)]),custom_model([]))
    batch=detector.compare(Image.new("RGB",(100,80)))
    assert len(batch)==2 and batch.comparison["primary_retained_count"]==2
    for original,kept in zip(originals,batch):
        assert kept["label"]==original["label"] and kept["bbox_xyxy"]==original["bbox_xyxy"]
        assert kept["confidence"]>=original["confidence"]


def test_aliases_do_not_add_duplicate_checklist_items_or_votes():
    custom=custom_model([row("cable",.8),row("charging cable",.7,class_id=1)],{0:"cable",1:"charging cable"})
    detector=CustomVocabularyDetector(Model([]),Model([]),custom)
    batch=detector.compare(Image.new("RGB",(100,80)))
    assert len(batch)==1 and len(batch.comparison["custom"])==2
    assert set(batch[0]["custom_labels"])=={"cable","charging cable"}
    assert batch[0]["source_scores"]=={"custom":.8}


def test_missing_custom_class_is_not_a_negative_vote():
    batch=CustomVocabularyDetector(Model(),Model(),custom_model([])).compare(Image.new("RGB",(100,80)))
    assert batch[0]["model_count"]==2 and batch[0]["agreement"]=="both"
    assert not batch[0]["custom_supported"]


def test_custom_failure_is_visible_and_disables_repeat_failed_calls():
    custom=custom_model([],fail=True);detector=CustomVocabularyDetector(Model(),Model(),custom)
    for _ in range(2):
        batch,jpeg=detector(Image.new("RGB",(100,80)))
        assert batch and jpeg and batch.comparison["status"]=="degraded_custom_unavailable"
    assert not detector.status()["custom_ready"] and custom.calls==1
    assert "private model" not in json.dumps(batch.comparison)


def test_partial_model_failure_does_not_claim_three_model_consensus():
    detector=CustomVocabularyDetector(Model(),Model(fail=True),custom_model([row("chair",.8,class_id=1)]))
    batch=detector.compare(Image.new("RGB",(100,80)))
    assert batch.comparison["status"]=="cross_checked_partial"
    assert batch[0]["model_count"]==2 and batch[0]["agreement"]!="all_three"


def test_custom_benchmark_includes_custom_and_shared_class_metrics(tmp_path):
    images=tmp_path/"images";labels=tmp_path/"labels";images.mkdir();labels.mkdir()
    Image.new("RGB",(100,80)).save(images/"room.jpg")
    (labels/"room.txt").write_text("0 .3 .375 .4 .5\n2 .8 .375 .2 .5\n")
    custom=custom_model([row("cable",.8,box=(70,10,90,50)),row("chair",.8,class_id=1)])
    detector=CustomVocabularyDetector(Model(),Model(),custom)
    result=benchmark_directory(detector,images,labels,tmp_path/"out")
    assert "custom" in result["metrics"] and result["metrics"]["fused"]["f1"]==1
    assert result["shared_class_ground_truth_objects"]==1
    assert result["shared_class_metrics"]["primary"]["f1"]==1


def test_saved_vocabulary_weights_and_notebook_are_complete():
    meta=ROOT/"downloads/custom-model/custom_labels.json"
    if not meta.is_file():meta=ROOT/"models/custom_labels.json"
    data=json.loads(meta.read_text(encoding="utf-8"))
    assert len(data["labels"])==61 and all(label in data["labels"] for label in ["cable","tissues","walker","trash","elevator"])
    assert hashlib.sha256((meta.parent/"yoloworld_custom.safetensors").read_bytes()).hexdigest()==data["weights_sha256"]
    nb=nbformat.read(ROOT/"downloads/KakiKitaAI_Custom_Labels_Colab.ipynb",as_version=4);nbformat.validate(nb)
    assert all(not c.get("outputs") and c.get("execution_count") is None for c in nb.cells if c.cell_type=="code")
    code="\n".join(c.source for c in nb.cells if c.cell_type=="code")
    assert "weights_only=False" not in code and ".set_classes(" not in code and "from custom_world_detection import" not in code
    assert "SHOW_PHONE_TOKEN = False" in nb.cells[-1].source


def test_custom_photo_and_authenticated_live_api(tmp_path):
    from fastapi.testclient import TestClient
    ns,calls=fake_engine()
    nb=nbformat.read(ROOT/"downloads/KakiKitaAI_Custom_Labels_Colab.ipynb",as_version=4)
    core=next(c.source for c in nb.cells if c.cell_type=="code" and "class ComparatorDetector:" in c.source)
    exec(core,ns)
    custom=next(c.source for c in nb.cells if c.cell_type=="code" and "class CustomVocabularyDetector(" in c.source)
    exec(custom.split("\nCUSTOM_MIN_CONF =",1)[0],ns)
    ns["comparator_detector"]=ns["CustomVocabularyDetector"](ns["yolo_model"],ns["comparator_model"],custom_model([row("cable",.8)]))
    ns.update(IN_COLAB=True,service_records=[])
    exec(next(c.source for c in nb.cells if c.cell_type=="code" and "app = FastAPI(" in c.source),ns)
    live=next(c.source for c in nb.cells if c.cell_type=="code" and "class LiveEngine:" in c.source)
    exec(live.split("BROWSER_CAPTURE_JS =",1)[0],ns)
    engine=ns["LiveEngine"](ns["run_yolo"],None,tmp_path);ns["live_engine"]=engine
    exec(next(c.source for c in nb.cells if c.cell_type=="code" and "def require_live_token(" in c.source),ns)
    exec((ROOT/"notebook-tools/phone_relay_api.py").read_text(encoding="utf-8"),ns)
    client=TestClient(ns["app"]);headers={"Authorization":"Bearer "+ns["LIVE_API_TOKEN"]}
    try:
        health=client.get("/health").json()
        assert health["detector_comparison"]["custom_ready"] and "cable" in health["custom_labels"]
        photo=client.post("/detect",files={"file":("room.jpg",jpeg(),"image/jpeg")}).json()
        assert photo["models"]["object_detection_custom"]=="yoloworld_custom"
        assert any(r["label"]=="cable" and r["needs_review"] for r in photo["yolo"]["detections"])
        id=client.post("/phone/start",headers=headers,json={}).json()["session_id"]
        assert client.post(f"/phone/{id}/frame",content=jpeg(),headers={**headers,"Content-Type":"image/jpeg"}).status_code==202
        deadline=time.monotonic()+3
        while engine.snapshot()["latest"] is None and time.monotonic()<deadline:time.sleep(.01)
        latest=client.get("/live/status",headers=headers).json()["latest"]
        assert latest["comparison"]["custom"][0]["label"]=="cable"
        assert client.get("/live/frame.jpg",headers=headers).status_code==200
        assert client.post(f"/phone/{id}/stop",headers=headers).json()["active"] is False
        assert client.post(f"/phone/{id}/frame",content=jpeg(),headers={**headers,"Content-Type":"image/jpeg"}).status_code==409
        assert len(calls)==1
    finally:
        engine.stop()
        if engine.session:
            for worker in engine.session["threads"]:worker.join(timeout=3)
