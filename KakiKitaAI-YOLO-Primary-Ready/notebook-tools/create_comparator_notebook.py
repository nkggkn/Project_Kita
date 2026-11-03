"""Create a self-contained comparator copy; never overwrite the working backend."""
import ast
import hashlib
from pathlib import Path
import nbformat

ROOT = Path(__file__).resolve().parents[1]
TOOLS = Path(__file__).resolve().parent
SOURCE = ROOT / "downloads/KakiKitaAI_Tapo_C200_Colab.ipynb"
OUTPUT = ROOT / "downloads/KakiKitaAI_Comparator_Colab.ipynb"

BOOTSTRAP = '''
previous_live = globals().get("live_engine")
if previous_live is not None:
    previous_live.stop()
    for worker in previous_live.session["threads"] if previous_live.session else []:
        worker.join(timeout=3)
    if previous_live.session and any(worker.is_alive() for worker in previous_live.session["threads"]):
        raise RuntimeError("Previous inference is finishing. Wait a few seconds, then rerun this cell.")
with YOLO_LOCK:
    comparator_detector = ComparatorDetector(yolo_model, comparator_model, YOLO_DEVICE,
        primary_name=YOLO_MODEL_NAME, comparator_name=COMPARATOR_MODEL_NAME,
        match_iou=MATCH_IOU, load_error=COMPARATOR_LOAD_ERROR)

def _run_yolo_unlocked(image_rgb):
    return comparator_detector(image_rgb)

# Keep the existing paid report call count and pass compact, clearly marked clues.
_original_run_claude = getattr(run_claude, "_kita_original", run_claude)
def run_claude(image_rgb, yolo_detections, max_attempts=3):
    clues = [{key: row.get(key) for key in ("label", "confidence", "bbox_xyxy", "agreement", "needs_review")}
             for row in yolo_detections[:60]]
    return _original_run_claude(image_rgb, clues, max_attempts=max_attempts)
run_claude._kita_original = _original_run_claude

_original_analyse_image_bytes = getattr(analyse_image_bytes, "_kita_original", analyse_image_bytes)
def analyse_image_bytes(image_bytes):
    result = _original_analyse_image_bytes(image_bytes)
    detections = result["yolo"]["detections"]
    result["comparison"] = detections.comparison
    result["engine"] = "Kaki Kita Object Comparator"
    result["models"]["object_detection_comparator"] = COMPARATOR_MODEL_NAME
    result["models"]["detection_output"] = result["comparison"]["status"]
    result["yolo"]["output_source"] = result["comparison"]["status"]
    return result
analyse_image_bytes._kita_original = _original_analyse_image_bytes

print("Detector comparison:", comparator_detector.status())
if not comparator_detector.status()["comparator_ready"]:
    print("WARNING: Main-model fallback only. The image header and /health report this; rerun the model-loading and comparison-engine cells to enable cross-checking.")
'''

DEMO = '''
if RUN_COMPARISON_PHOTO:
    from IPython.display import display
    if IN_COLAB:
        from google.colab import files
        uploads = files.upload()
        if not uploads:
            raise ValueError("Choose one room photo.")
        raw = next(iter(uploads.values()))
    else:
        raw = Path(input("Room photo path: ").strip()).read_bytes()
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    image.thumbnail((1568,1568))
    batch = comparator_detector.compare(image)
    comparison = batch.comparison
    for title, rows in (("Main model: YOLOv8n", comparison["primary"]),
                        ("Comparator: RT-DETR-L", comparison["comparator"]),
                        ("Combined result (orange = review)", batch)):
        print(title, "objects:", len(rows))
        display(comparator_detector.annotate(image, rows, title))
    print(json.dumps({key: value for key, value in comparison.items() if key not in ("primary", "comparator")}, indent=2))
    print("This is an inference comparison, not an accuracy test. No Claude request was made.")
else:
    print("Optional comparison photo skipped. Set RUN_COMPARISON_PHOTO=True to compare a room photo without Claude charges.")
'''

BENCHMARK = '''
BENCHMARK_IMAGES = Path("/content/benchmark/images") if IN_COLAB else Path("benchmark/images")
BENCHMARK_LABELS = BENCHMARK_IMAGES.parent / "labels"
BENCHMARK_OUTPUT = BENCHMARK_IMAGES.parent / "results"
if RUN_COMPARATOR_BENCHMARK:
    report = benchmark_directory(comparator_detector, BENCHMARK_IMAGES, BENCHMARK_LABELS, BENCHMARK_OUTPUT)
    print(json.dumps(report, indent=2))
    print("Saved report.json and predictions.json in:", BENCHMARK_OUTPUT)
else:
    print("Accuracy benchmark skipped. Add held-out images and human-checked YOLO labels, then enable RUN_COMPARATOR_BENCHMARK.")
'''


def replace_once(source, before, after):
    assert source.count(before) == 1, before
    return source.replace(before, after, 1)


def build():
    original = SOURCE.read_bytes()
    nb = nbformat.reads(original.decode("utf-8"), as_version=4)
    nb.cells[0].source = """# Kaki Kita AI — Object Comparator + Mobile Live Backend
Your working backend is preserved. This copy adds **RT-DETR-L** alongside the
existing **YOLOv8n** detector. Photos, uploaded-video frames, USB/browser webcams,
YouTube Live and Android camera frames all use the same comparison stage.

`same frame → YOLOv8n + RT-DETR-L → YOLO objects + supporting evidence → existing app`

## Run in Colab
1. Choose **Runtime → Change runtime type → GPU** (recommended). Add your existing
   Anthropic/ngrok secrets. No second paid AI provider/key is needed.
2. Stop the old notebook/tunnel, then **Run all** here. First run downloads both
   model weights. CPU works but is slower. Check `/health`:
   `detector_comparison.comparator_ready` must be `true` for two-model operation.
3. Copy the printed API URL into the app. In the last **Private phone connection**
   cell set `SHOW_PHONE_TOKEN=True`, run that cell, and enter its token in the app.
   Keep credentials and tokens private. Your current APK and step-by-step setup work.

## YOLO is the main detector
- Every valid YOLOv8n detection at the original 0.25 inference cutoff is kept.
  Supporting models never veto it, change its label or move its bounding box.
- RT-DETR only supports same-label overlapping boxes (IoU >= 0.55). It does not
  create checklist items. Missing/different detections are diagnostics, never a gate.
- The raw `yolo_confidence` stays available. If a supporting detector has a higher
  score, the display score can rise halfway toward the highest supporting score.
  It can never fall below YOLO's score. This is a heuristic, not calibrated accuracy.
- If support fails, all YOLO detections continue with an explicit degraded status.
- No extra suppression or 0.65 single-model filter is applied to YOLO results.
  These pretrained models still cannot identify every kind of rubbish or hazard.

The app-compatible combined objects remain at `yolo.detections`. Additional
`comparison` data includes each model's raw detections, disagreements and timings.
Live status and downloaded JSONL logs include the comparison for that exact frame.
Claude still provides the existing optional descriptions, without an extra report call.
There is no AI After-photo generation and no automatic camera or paid image test.

## Check whether it really improves
Use **Optional: compare one photo** for side-by-side outputs (no Claude call).
Use **Held-out accuracy benchmark** with human-labelled images to compare precision,
recall, F1 at IoU 0.50, and latency for main/comparator/combined results. No accuracy
gain has been established on your rooms yet. Keep test rooms separate from tuning
images; choose a separate validation set when adjusting thresholds. Two detectors
require more compute and may reduce live throughput; live input keeps only the newest frame.

Original authenticated phone/live routes, stop handling, webcam controls, GeoJSON,
ngrok collision checks and Claude model settings are retained.

[RT-DETR documentation](https://docs.ultralytics.com/models/rtdetr/) ·
[YOLO documentation](https://docs.ultralytics.com/models/yolov8/)
"""
    nb.cells[1].source = """## Backend compatibility
Existing upload, health, services, phone, webcam and live routes remain compatible.
`analysis` and the legacy `gemini` alias still contain Claude's report (Gemini is not called).
`yolo.detections` now contains combined detections with agreement/review fields.
Photo `comparison` and live `latest.comparison` contain per-frame model diagnostics.
Claude configuration and paid-report limits are retained. `/health` is a readiness
check, not an accuracy result or proof that a paid request will succeed.
"""
    nb.cells[5].source = replace_once(nb.cells[5].source, "anthropic ultralytics fastapi", "anthropic ultralytics==8.4.162 fastapi")
    nb.cells[6].source = """## 2. Shared settings
Keep the existing Claude model/key. `RUN_COMPARISON_PHOTO` and
`RUN_COMPARATOR_BENCHMARK` are opt-in and never run on normal startup.
Confidence support settings are below the detector load cell. A GPU is recommended for two detectors.
"""
    nb.cells[7].source = replace_once(nb.cells[7].source, "UPLOAD_SERVICE_FILES = False", "UPLOAD_SERVICE_FILES = False\nRUN_COMPARISON_PHOTO = False\nRUN_COMPARATOR_BENCHMARK = False")
    nb.cells[8].source = """## 3. Load the two COCO detectors
YOLOv8n remains the main detector. RT-DETR-L is the comparator. The first run
downloads the official pretrained weights; later runs use the runtime cache.
If RT-DETR cannot load, the app remains in explicitly marked main-model fallback.
"""
    nb.cells[9].source += '''
from ultralytics import RTDETR
COMPARATOR_MODEL_NAME = "rtdetr-l.pt"
MATCH_IOU = 0.55
comparator_model = None
COMPARATOR_LOAD_ERROR = None
try:
    comparator_model = RTDETR(COMPARATOR_MODEL_NAME)
except Exception as exc:
    COMPARATOR_LOAD_ERROR = type(exc).__name__
    print("Comparator did not load:", COMPARATOR_LOAD_ERROR, "— check network/GPU setup, then rerun this cell and the comparison-engine cell below.")
print("Comparator weights loaded:", comparator_model is not None)
'''
    nb.cells[10].source = """## 4. Build the existing report engine and add comparison
Both detectors independently inspect the same pixels. Their box results are
cross-checked before the optional Claude report. Agreement and uncertainty remain
explicit; Claude's observations are not averaged with detection confidence scores.
"""
    engine = nb.cells[11].source
    engine = replace_once(engine, "general-purpose YOLO model", "pair of general-purpose object detectors")
    engine = replace_once(engine, "Use the YOLO list as supplementary clues only", "Use the detector list as supplementary clues only")
    engine = replace_once(engine, "YOLO supplementary detections:", "Object detection clues (agreement is not ground truth; needs_review items are unconfirmed):")
    engine = replace_once(engine, "- State uncertainty clearly.", "- State uncertainty clearly. Detector agreement can still be wrong; do not turn needs_review objects into facts.")
    nb.cells[11].source = engine
    nb.cells.insert(12, nbformat.v4.new_code_cell((TOOLS/"comparator_detection.py").read_text(encoding="utf-8") + "\n" + BOOTSTRAP))
    for cell in nb.cells:
        if cell.cell_type != "code":
            continue
        if "def health():" in cell.source:
            cell.source = cell.source.replace('title="Kita Vision 2.0 Dual-AI API"', 'title="Kaki Kita Object Comparator API"')
            cell.source = cell.source.replace('description="YOLOv8n object detection + Claude visual interpretation"', 'description="YOLOv8n + RT-DETR-L cross-checked detections and optional Claude reports"')
            cell.source = cell.source.replace('"engine": "Kita Vision 2.0 Dual-AI"', '"engine": "Kaki Kita Object Comparator"')
            cell.source = replace_once(cell.source, '"yolo_model": YOLO_MODEL_NAME,', '"yolo_model": YOLO_MODEL_NAME,\n        "detector_comparison": comparator_detector.status(),')
        if "class LiveEngine:" in cell.source:
            cell.source = replace_once(cell.source, '"detection_count": len(detections), "detections": detections,', '"detection_count": len(detections), "detections": detections,\n                        "comparison": getattr(detections, "comparison", None),')
    evaluation = (TOOLS/"comparator_evaluation.py").read_text(encoding="utf-8")
    evaluation = replace_once(evaluation, "from comparator_detection import box_iou\n", "")
    extras = [nbformat.v4.new_markdown_cell("## Optional: compare one photo\nSet `RUN_COMPARISON_PHOTO=True` in Shared settings and run this cell. It displays both detectors and the combined result without Claude calls."),
              nbformat.v4.new_code_cell(DEMO),
              nbformat.v4.new_markdown_cell("""## Held-out accuracy benchmark (optional)
Upload images to `/content/benchmark/images/` and matching human-checked labels
to `/content/benchmark/labels/`. Use the same relative filenames with `.txt` labels.
Each YOLO label line is `class_id centre_x centre_y width height`, normalized 0–1.
Class IDs must match `yolo_model.names` (COCO). An empty label file means a human
checked that no labelled-class objects exist; a missing file is an error.
Include different rooms/lighting and some empty images. Do not generate truth labels
using either detector. Turn on `RUN_COMPARATOR_BENCHMARK` and run the two cells below.
Outputs are `report.json` and `predictions.json` in the benchmark `results/` folder.
This is a fixed-threshold precision/recall/F1 test, not official COCO mAP.
"""), nbformat.v4.new_code_cell(evaluation), nbformat.v4.new_code_cell(BENCHMARK)]
    position = next(i for i, cell in enumerate(nb.cells) if cell.cell_type == "markdown" and cell.source.startswith("## Private phone connection"))
    nb.cells[position:position] = extras
    for i, cell in enumerate(nb.cells):
        cell.id = f"comparator-{i:03d}";cell.metadata = {"id": cell.id}
        if cell.cell_type == "code":
            cell.outputs = [];cell.execution_count = None
            ast.parse("\n".join("pass" if line.startswith("%") else line for line in cell.source.splitlines()))
    nb.metadata.colab.name = OUTPUT.name
    nb.metadata["kakikita_comparator_source"] = {"name": SOURCE.name, "sha256": hashlib.sha256(original).hexdigest()}
    nbformat.validate(nb);nbformat.write(nb, OUTPUT)
    assert SOURCE.read_bytes() == original
    print(f"Created {OUTPUT.name}: {len(nb.cells)} cells; source preserved; outputs cleared.")


if __name__ == "__main__":
    build()
