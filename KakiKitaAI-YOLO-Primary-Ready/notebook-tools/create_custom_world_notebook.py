"""Add the supplied saved vocabulary to a copy of the current comparator backend."""
import ast
import hashlib
import json
from pathlib import Path
import nbformat

ROOT=Path(__file__).resolve().parents[1]
TOOLS=Path(__file__).resolve().parent
SOURCE=ROOT/"downloads/KakiKitaAI_Comparator_Colab.ipynb"
OUTPUT=ROOT/"downloads/KakiKitaAI_Custom_Labels_Colab.ipynb"


def build():
    original=SOURCE.read_bytes();nb=nbformat.reads(original.decode("utf-8"),as_version=4)
    metadata_path=ROOT/"downloads/custom-model/custom_labels.json"
    if not metadata_path.is_file():metadata_path=ROOT/"models/custom_labels.json"
    metadata=json.loads(metadata_path.read_text(encoding="utf-8"))
    weights_hash=metadata["weights_sha256"];metadata_hash=hashlib.sha256(metadata_path.read_bytes()).hexdigest()
    title="""# Kaki Kita AI — YOLO Primary + Confidence Support + 61 Custom Labels
This copy retains YOLOv8n and RT-DETR-L, then adds your saved **YOLO-World** model.
All **61 saved prompt labels and text embeddings** are preserved; no label list is
reset to COCO and no CLIP/text-encoder download is needed for this fixed vocabulary.

## Ready to run in Colab
1. Open this notebook. Choose a GPU runtime and add your existing Anthropic/ngrok secrets.
2. Stop the old notebook/tunnel. Run all. At the custom-model prompt, upload the
   **KakiKitaAI-YOLO-Primary-Ready.zip** (the previous custom-label ZIP also works) provided with this notebook.
3. Check printed health: `detector_comparison.custom_ready: True`, `custom_label_count: 61`.
4. Use the printed API URL and private live token in your existing Android app.
   The token is in the final Private phone connection cell. Keep secrets private.

The ZIP contains a data-only copy of your weights plus the exact saved label list.
Only those two checked files are read from the ZIP; notebook/source files in it
are not executed. The original `.pt` is preserved. A one-element bias shape is
normalized for the matching official architecture without changing its value.

## YOLO decides; the other model only supports confidence
- YOLOv8n keeps every valid detection at 0.25, with its exact label and box.
  RT-DETR cannot remove detections, move boxes, relabel objects or add its own items.
- The supplied YOLO-World remains an extra-label YOLO detector with all 61 saved
  prompts. Its default cutoff is restored to 0.25. Additional same-label nearby
  objects are not suppressed by a second consensus/NMS step.
- Shared detections can receive confidence support. Scores never decrease, and
  raw `yolo_confidence` remains available. Confidence support is not calibrated accuracy.
- Custom YOLO objects remain marked for review. Labels such as hazard, obstacle or
  wheelchair do not prove safety, accessibility or a person's disability.
- Main YOLO objects stay first in the output and are drawn on top of extra boxes.
- Existing mobile/stream APIs, Claude limits and all stop handling remain included.
  Three detectors add compute; GPU speed and room accuracy still need validation.

## Optional checks and labels
The comparison-photo tool shows all four views: main, comparator, custom, combined.
The accuracy benchmark reports all four outputs plus a separate shared-COCO table,
so extra vocabulary is not mistaken for improved accuracy on common objects.
Use the exported `MODEL-CLASS-MAP.json` for benchmark labels. Its IDs differ from
the original custom model's 0–60 IDs; never combine numeric class IDs blindly.
"""
    nb.cells[0].source=title+"\n\n## Saved vocabulary\n"+", ".join(metadata["labels"])
    for cell in nb.cells:
        if cell.cell_type!="code":continue
        cell.source=cell.source.replace("ultralytics==8.4.162","ultralytics==8.4.198 safetensors==0.8.0")
        if "class ComparatorDetector:" in cell.source:
            before='result["models"]["object_detection_comparator"] = COMPARATOR_MODEL_NAME'
            assert cell.source.count(before)==1
            cell.source=cell.source.replace(before,before+'\n    if hasattr(comparator_detector, "custom_vocabulary"):\n        result["models"]["object_detection_custom"] = "yoloworld_custom"')
        if "def health():" in cell.source:
            before='"detector_comparison": comparator_detector.status(),'
            assert cell.source.count(before)==1
            cell.source=cell.source.replace(before,before+'\n        "custom_labels": comparator_detector.custom_vocabulary,\n        "detection_class_map": comparator_detector.names,')
        if "if RUN_COMPARISON_PHOTO:" in cell.source:
            before='("Combined result (orange = review)", batch)'
            assert cell.source.count(before)==1
            cell.source=cell.source.replace(before,'("Custom labels: YOLO-World", [dict(r, needs_review=True) for r in comparison["custom"]]),\n                        '+before)
        if "def benchmark_directory(" in cell.source:
            cell.source=(TOOLS/"comparator_evaluation.py").read_text(encoding="utf-8").replace("from comparator_detection import box_iou\n","")
    custom_source=(TOOLS/"custom_world_detection.py").read_text(encoding="utf-8")
    custom_source=custom_source.replace("from comparator_detection import ComparatorDetector, DetectionBatch, box_iou, clean_predictions, confidence_from_support\n","")
    setup=f'''
CUSTOM_MIN_CONF = 0.25
CUSTOM_WEIGHTS_SHA256 = {weights_hash!r}
CUSTOM_METADATA_SHA256 = {metadata_hash!r}
CUSTOM_MODEL_DIR = Path("/content/kakikita_models") if IN_COLAB else Path.cwd()/"models"
CUSTOM_MODEL_DIR.mkdir(parents=True, exist_ok=True)
weights_path=CUSTOM_MODEL_DIR/"yoloworld_custom.safetensors"
labels_path=CUSTOM_MODEL_DIR/"custom_labels.json"
if not weights_path.is_file() or not labels_path.is_file():
    if not IN_COLAB:
        raise FileNotFoundError("Extract the ready ZIP beside this notebook, including its models folder.")
    from google.colab import files
    import zipfile
    print("Upload the YOLO-Primary ready ZIP or your previous custom-label ready ZIP.")
    uploads=files.upload()
    if len(uploads)!=1:raise ValueError("Choose the one ready ZIP file.")
    with zipfile.ZipFile(io.BytesIO(next(iter(uploads.values())))) as bundle:
        for name,target in (("models/yoloworld_custom.safetensors",weights_path),("models/custom_labels.json",labels_path)):
            info=bundle.getinfo(name)
            if info.file_size>40_000_000:raise ValueError("Unexpected model bundle size.")
            target.write_bytes(bundle.read(name))
custom_model=SavedWorldAdapter(weights_path,labels_path,CUSTOM_WEIGHTS_SHA256,CUSTOM_METADATA_SHA256)
previous_live=globals().get("live_engine")
if previous_live is not None:
    previous_live.stop()
    for worker in previous_live.session["threads"] if previous_live.session else []:worker.join(timeout=3)
    if previous_live.session and any(worker.is_alive() for worker in previous_live.session["threads"]):
        raise RuntimeError("Previous inference is finishing. Wait, then rerun this cell.")
with YOLO_LOCK:
    comparator_detector=CustomVocabularyDetector(yolo_model,comparator_model,custom_model,YOLO_DEVICE,
        match_iou=MATCH_IOU,custom_min_conf=CUSTOM_MIN_CONF,load_error=COMPARATOR_LOAD_ERROR)
(CUSTOM_MODEL_DIR/"MODEL-CLASS-MAP.json").write_text(json.dumps(comparator_detector.names,indent=2),encoding="utf-8")
print("Custom labels ready:", comparator_detector.status()["custom_ready"])
print("Saved labels:", len(custom_model.names))
print(json.dumps(custom_model.names, indent=2))
print("Benchmark class IDs:", CUSTOM_MODEL_DIR/"MODEL-CLASS-MAP.json")
'''
    index=next(i for i,c in enumerate(nb.cells) if c.cell_type=="code" and "class ComparatorDetector:" in c.source)+1
    nb.cells[index:index]=[nbformat.v4.new_markdown_cell("## 4b. Load all saved custom labels\nUpload the ready ZIP when asked. The saved label embeddings are reused; do not call set_classes() with a replacement vocabulary."),nbformat.v4.new_code_cell(custom_source+"\n"+setup)]
    for i,cell in enumerate(nb.cells):
        cell.id=f"custom-{i:03d}";cell.metadata={"id":cell.id}
        if cell.cell_type=="code":
            cell.outputs=[];cell.execution_count=None
            ast.parse("\n".join("pass" if l.startswith("%") else l for l in cell.source.splitlines()))
    nb.metadata.colab.name="KakiKitaAI_YOLO_Primary_Colab.ipynb"
    nb.metadata["kakikita_custom_source"]={"name":SOURCE.name,"sha256":hashlib.sha256(original).hexdigest(),"weights_sha256":weights_hash,"original_pt_sha256":metadata["source_sha256"]}
    nbformat.validate(nb);nbformat.write(nb,OUTPUT)
    nbformat.write(nb,ROOT/"downloads/KakiKitaAI_YOLO_Primary_Colab.ipynb")
    assert SOURCE.read_bytes()==original
    print(f"Created {OUTPUT.name}: {len(nb.cells)} cells; 61 custom labels; previous backend preserved.")


if __name__=="__main__":build()
