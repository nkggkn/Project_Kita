"""Deterministic fusion, scoring, photo API, and live compatibility checks. No paid calls."""
import ast
import base64
import hashlib
import io
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import nbformat
import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
sys.path.insert(0, str(ROOT/".notebook-test-deps"))
from comparator_detection import ComparatorDetector, box_iou, fuse_predictions
from comparator_evaluation import benchmark_directory, detection_metrics, read_yolo_labels


def row(label="chair", score=.9, box=(10,10,50,50), class_id=0):
    return {"label":label, "confidence":score, "bbox_xyxy":list(box), "class_id":class_id}


class Tensor:
    def __init__(self, values):self.values=values
    def cpu(self):return self
    def tolist(self):return self.values


class Model:
    names = {0:"chair",1:"couch"}
    def __init__(self, rows=None, fail=False):self.rows=rows;self.fail=fail;self.calls=0
    def predict(self, source, **kwargs):
        self.calls+=1
        if self.fail:raise RuntimeError("private model failure details")
        rows=self.rows(source) if callable(self.rows) else self.rows if self.rows is not None else [row()]
        return [SimpleNamespace(boxes=SimpleNamespace(cls=Tensor([r["class_id"] for r in rows]),
                 conf=Tensor([r["confidence"] for r in rows]),xyxy=Tensor([r["bbox_xyxy"] for r in rows])))]


def test_support_never_moves_yolo_boxes_or_lowers_yolo_confidence():
    batch=fuse_predictions([row(score=.9)],[row(score=.5,box=(14,10,54,50))],100,80)
    assert len(batch)==1 and batch[0]["agreement"]=="both"
    assert batch[0]["confidence"]==.9
    assert batch[0]["yolo_confidence"]==.9
    assert batch[0]["bbox_xyxy"]==[10,10,50,50]
    assert batch.comparison["agreed_count"]==1
    assert batch.comparison["primary"][0]["bbox_xyxy"]==[10,10,50,50]


def test_class_labels_not_foreign_numeric_ids_determine_agreement():
    batch=fuse_predictions([row(class_id=0)],[row(label="CHAIR",class_id=19)],100,80)
    assert len(batch)==1 and batch[0]["class_id"]==0 and batch[0]["agreement"]=="both"


def test_disagreement_preserves_yolo_label_box_and_score():
    batch=fuse_predictions([row()],[row("couch",class_id=1)],100,80)
    assert len(batch)==1 and batch[0]["label"]=="chair" and batch[0]["confidence"]==.9
    assert len(batch.comparison["label_disagreements"])==1
    assert len(batch.comparison["review_candidates"])==1
    assert batch[0]["needs_review"]


def test_unconfirmed_yolo_detections_are_retained_at_original_threshold():
    batch=fuse_predictions([row(score=.8),row("couch",.4,box=(60,10,90,50),class_id=1)],[],100,80)
    assert len(batch)==2 and batch[0]["needs_review"] and batch[0]["agreement"]=="primary_only"
    assert batch[1]["confidence"]==.4
    assert fuse_predictions([],[],100,80).comparison["agreement_fraction"] is None
    with pytest.raises(ValueError):fuse_predictions([],[],100,80,match_iou=0)


def test_nearby_objects_remain_separate_and_duplicate_is_only_reviewed():
    a=row(box=(5,5,35,35));b=row(box=(45,5,75,35))
    batch=fuse_predictions([a,b],[a,b,a],100,80)
    assert len(batch)==2 and batch.comparison["agreed_count"]==2
    assert batch.comparison["review_candidates"][0]["review_reason"]=="support_model_only"


def test_support_model_cannot_add_objects_and_stronger_support_only_boosts():
    assert fuse_predictions([],[row()],100,80)==[]
    batch=fuse_predictions([row(score=.4)],[row(score=.8)],100,80)
    assert batch[0]["confidence"]==pytest.approx(.6)
    assert batch[0]["bbox_xyxy"]==[10,10,50,50] and batch[0]["yolo_confidence"]==.4


def test_dense_overlapping_yolo_objects_are_never_post_filtered():
    primary=[row(score=.25,box=(10,10,50,50)),row(score=.26,box=(20,10,60,50))]
    for support in [[],[row("couch",.99,class_id=1)],[row(score=.9)]]:
        batch=fuse_predictions(primary,support,100,80)
        assert len(batch)==len(primary)
        for original,kept in zip(primary,batch):
            assert kept["label"]==original["label"] and kept["bbox_xyxy"]==original["bbox_xyxy"]
            assert kept["confidence"]>=original["confidence"]


def test_invalid_coordinates_are_rejected_and_valid_boxes_clipped():
    batch=fuse_predictions([row(box=(-5,-5,150,100)),row(score=float("nan")),row(box=(50,10,5,20))],[],100,80)
    assert batch[0]["bbox_xyxy"]==[0,0,100,80]
    assert batch.comparison["invalid_predictions"]["primary"]==2
    json.dumps(batch.comparison,allow_nan=False)


def test_runner_canonicalises_class_maps_and_keeps_per_image_metadata():
    comparator=Model([row("chair",class_id=1)]);comparator.names={0:"couch",1:"chair"}
    detector=ComparatorDetector(Model(),comparator)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(detector.compare,[Image.new("RGB",(100,80)),Image.new("RGB",(100,80))]))
    assert results[0].comparison is not results[1].comparison
    assert results[0][0]["class_id"]==0 and results[0][0]["agreement"]=="both"
    different=Model();different.names={0:"unknown",1:"couch"}
    with pytest.raises(ValueError):ComparatorDetector(Model(),different)


def test_comparator_failure_is_visible_and_not_retried_every_frame():
    failing=Model(fail=True);detector=ComparatorDetector(Model(),failing)
    for _ in range(2):
        batch, jpeg=detector(Image.new("RGB",(100,80)))
        assert batch.comparison["status"]=="degraded_primary_only"
        assert batch[0]["needs_review"] and jpeg
        assert "private model" not in json.dumps(batch.comparison)
    assert not detector.status()["comparator_ready"] and failing.calls==1


def test_jpeg_output_handles_tiny_images_without_changing_input():
    image=Image.new("RGB",(1,1),"white")
    detector=ComparatorDetector(Model([row(box=(0,0,1,1))]),Model([row(box=(0,0,1,1))]))
    batch, jpeg=detector(image)
    assert Image.open(io.BytesIO(base64.b64decode(jpeg))).size==(1,1)
    assert image.getpixel((0,0))==(255,255,255) and batch


def test_scoring_penalises_wrong_labels_duplicates_and_misses():
    truth=[row(),row("couch",box=(60,5,90,35),class_id=1)]
    records=[{"truth":truth,"pred":[row(),row(),row("wrong",box=(60,5,90,35),class_id=7)]}]
    score=detection_metrics(records,"pred")
    assert (score["true_positives"],score["false_positives"],score["false_negatives"])==(1,2,1)
    assert score["precision"]==.3333 and score["recall"]==.5 and score["f1"]==.4
    assert box_iou((0,0,0,0),(0,0,1,1))==0


def test_ground_truth_is_required_and_validated(tmp_path):
    with pytest.raises(ValueError,match="Missing ground-truth"):read_yolo_labels(tmp_path/"missing.txt",{0:"chair"},100,80)
    path=tmp_path/"one.txt"
    for invalid in ["0 nan 0.5 0.3 0.3","9 0.5 0.5 0.3 0.3","0 .5 .5 0 .3","0 .5 .5"]:
        path.write_text(invalid)
        with pytest.raises(ValueError,match="Invalid YOLO"):read_yolo_labels(path,{0:"chair"},100,80)
    path.write_text("");assert read_yolo_labels(path,{0:"chair"},100,80)==[]


def test_benchmark_reports_same_image_metrics_and_latency(tmp_path):
    images=tmp_path/"images";labels=tmp_path/"labels";images.mkdir();labels.mkdir()
    Image.new("RGB",(100,80)).save(images/"one.jpg")
    (labels/"one.txt").write_text("0 .3 .375 .4 .5\n")
    report=benchmark_directory(ComparatorDetector(Model(),Model()),images,labels,tmp_path/"results")
    assert report["images"]==1 and report["metrics"]["fused"]["f1"]==1
    assert report["fused_f1_change_vs_primary"]==0
    assert (tmp_path/"results/predictions.json").is_file()
    with pytest.raises(ValueError,match="unavailable"):
        benchmark_directory(ComparatorDetector(Model(),None),images,labels,tmp_path/"no")


def notebook():return nbformat.read(ROOT/"downloads/KakiKitaAI_Comparator_Colab.ipynb",as_version=4)


def test_notebook_is_self_contained_and_preserves_working_source():
    nb=notebook();nbformat.validate(nb)
    assert nb.metadata.kakikita_comparator_source.sha256==hashlib.sha256((ROOT/"downloads/KakiKitaAI_Tapo_C200_Colab.ipynb").read_bytes()).hexdigest()
    for cell in nb.cells:
        if cell.cell_type=="code":
            assert not cell.outputs and cell.execution_count is None
            ast.parse("\n".join("pass" if line.startswith("%") else line for line in cell.source.splitlines()))
    assert "SHOW_PHONE_TOKEN = False" in nb.cells[-1].source
    code="\n".join(c.source for c in nb.cells if c.cell_type=="code")
    assert "RUN_COMPARISON_PHOTO = False" in code and "RUN_COMPARATOR_BENCHMARK = False" in code
    assert "from comparator_detection import" not in code and "diffusers" not in code


def fake_engine():
    report={"environment":"Room","overall_summary":"Check the chair.",**{key:[] for key in ["visible_observations","potential_obstacles","accessibility_concerns","recommendations","limitations"]}}
    calls=[]
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(stop_reason="tool_use",content=[SimpleNamespace(type="tool_use",name="submit_report",input=report)])
    ns={"client":SimpleNamespace(messages=SimpleNamespace(create=create)),"MODEL_NAME":"existing-claude-model",
        "YOLO_MODEL_NAME":"yolov8n.pt","YOLO_DEVICE":"cpu","COMPARATOR_MODEL_NAME":"rtdetr-l.pt",
        "MATCH_IOU":.55,"COMPARATOR_LOAD_ERROR":None,
        "yolo_model":Model(),"comparator_model":Model()}
    nb=notebook()
    engine=next(c.source for c in nb.cells if c.cell_type=="code" and "CLAUDE_PROMPT =" in c.source)
    adapter=next(c.source for c in nb.cells if c.cell_type=="code" and "class ComparatorDetector:" in c.source)
    exec(engine,ns);exec(adapter,ns)
    return ns,calls


def jpeg():
    out=io.BytesIO();Image.new("RGB",(100,80),"white").save(out,format="JPEG");return out.getvalue()


def test_photo_preserves_schema_and_makes_one_compact_claude_request():
    ns,calls=fake_engine();result=ns["analyse_image_bytes"](jpeg())
    assert result["yolo"]["detection_count"]==1 and result["analysis"]==result["gemini"]
    assert result["comparison"]["agreed_count"]==1
    assert result["models"]["object_detection_comparator"]=="rtdetr-l.pt"
    assert len(calls)==1 and '"agreement": "both"' in calls[0]["messages"][0]["content"][1]["text"]
    assert "source_scores" not in calls[0]["messages"][0]["content"][1]["text"]
    json.dumps(result,allow_nan=False)


def test_rerunning_adapter_does_not_wrap_itself_or_add_claude_calls():
    ns,calls=fake_engine()
    adapter=next(c.source for c in notebook().cells if c.cell_type=="code" and "class ComparatorDetector:" in c.source)
    exec(adapter,ns);exec(adapter,ns)
    result=ns["analyse_image_bytes"](jpeg())
    assert result["comparison"]["agreed_count"]==1 and len(calls)==1


def test_api_health_photo_and_private_live_frame_keep_comparison(tmp_path):
    from fastapi.testclient import TestClient
    ns,calls=fake_engine();ns.update(IN_COLAB=True,service_records=[])
    nb=notebook()
    exec(next(c.source for c in nb.cells if c.cell_type=="code" and "app = FastAPI(" in c.source),ns)
    live=next(c.source for c in nb.cells if c.cell_type=="code" and "class LiveEngine:" in c.source)
    exec(live.split("BROWSER_CAPTURE_JS =",1)[0],ns)
    engine=ns["LiveEngine"](ns["run_yolo"],None,tmp_path);ns["live_engine"]=engine
    exec(next(c.source for c in nb.cells if c.cell_type=="code" and "def require_live_token(" in c.source).split("# Protected browser-to-backend",1)[0],ns)
    exec((TOOLS/"phone_relay_api.py").read_text(encoding="utf-8"),ns)
    client=TestClient(ns["app"]);headers={"Authorization":"Bearer "+ns["LIVE_API_TOKEN"]}
    try:
        health=client.get("/health").json()
        assert health["phone_relay_available"] and health["detector_comparison"]["comparator_ready"]
        response=client.post("/detect",files={"file":("room.jpg",jpeg(),"image/jpeg")})
        assert response.status_code==200 and response.json()["comparison"]["agreed_count"]==1
        assert client.post("/phone/start",json={}).status_code==401
        id=client.post("/phone/start",json={},headers=headers).json()["session_id"]
        assert client.post(f"/phone/{id}/frame",content=jpeg(),headers={**headers,"Content-Type":"image/jpeg"}).status_code==202
        deadline=time.monotonic()+3
        while engine.snapshot()["latest"] is None and time.monotonic()<deadline:time.sleep(.01)
        latest=client.get("/live/status",headers=headers).json()["latest"]
        assert latest["comparison"]["agreed_count"]==1 and latest["detections"][0]["agreement"]=="both"
        assert client.get("/live/frame.jpg",headers=headers).status_code==200
        log=json.loads(client.get("/live/results.jsonl",headers=headers).text.splitlines()[0])
        assert log["comparison"]["primary"][0]["label"]=="chair"
        assert client.post(f"/phone/{id}/stop",headers=headers).json()["active"] is False
        assert len(calls)==1  # Photo only; live detections make no paid request.
    finally:
        engine.stop()
        if engine.session:
            for worker in engine.session["threads"]:worker.join(timeout=3)
