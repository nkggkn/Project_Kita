"""Held-out box evaluation; no Claude calls, guessed labels, or agreement-as-accuracy scores."""
import json
import math
from pathlib import Path
from PIL import Image, ImageOps
from comparator_detection import box_iou


def read_yolo_labels(path, names, width, height):
    path = Path(path)
    if not path.is_file():
        raise ValueError(f"Missing ground-truth label: {path.name}. Use an empty .txt for a verified empty image.")
    rows = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            values = line.split()
            if len(values) != 5:
                raise ValueError()
            class_id = int(values[0]);cx, cy, w, h = map(float, values[1:])
            if class_id not in names or not all(math.isfinite(x) and 0 <= x <= 1 for x in (cx, cy, w, h)) or w == 0 or h == 0:
                raise ValueError()
            x1, y1 = max(0, (cx-w/2)*width), max(0, (cy-h/2)*height)
            x2, y2 = min(width, (cx+w/2)*width), min(height, (cy+h/2)*height)
            if x2 <= x1 or y2 <= y1:
                raise ValueError()
        except (ValueError, OverflowError):
            raise ValueError(f"Invalid YOLO label at {path.name}:{line_number}.") from None
        rows.append({"class_id": class_id, "label": names[class_id], "bbox_xyxy": [x1,y1,x2,y2]})
    return rows


def detection_metrics(records, prediction_key, iou_threshold=.5):
    if not 0 < iou_threshold <= 1:
        raise ValueError("IoU threshold must be between zero and one.")
    tp = fp = fn = 0
    for record in records:
        truth = record["truth"];used = set()
        for pred in sorted(record[prediction_key], key=lambda row: row["confidence"], reverse=True):
            matches = [(box_iou(pred["bbox_xyxy"], obj["bbox_xyxy"]), i) for i, obj in enumerate(truth)
                       if i not in used and obj["class_id"] == pred["class_id"]]
            best = max(matches, default=(0, -1))
            if best[0] >= iou_threshold:
                tp += 1;used.add(best[1])
            else:
                fp += 1
        fn += len(truth) - len(used)
    precision = tp/(tp+fp) if tp+fp else 0.0
    recall = tp/(tp+fn) if tp+fn else 0.0
    return {"true_positives": tp, "false_positives": fp, "false_negatives": fn,
            "precision": round(precision, 4), "recall": round(recall, 4),
            "f1": round(2*precision*recall/(precision+recall), 4) if precision+recall else 0.0}


def benchmark_directory(detector, images_dir, labels_dir, output_dir):
    if not detector.status()["comparator_ready"]:
        raise ValueError("Comparator is unavailable. Rerun detector setup before benchmarking.")
    if detector.status().get("custom_ready") is False:
        raise ValueError("Custom detector is unavailable. Rerun custom model setup before benchmarking.")
    images_dir, labels_dir, output_dir = Path(images_dir), Path(labels_dir), Path(output_dir)
    images = sorted(p for p in images_dir.rglob("*") if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
    if not images:
        raise ValueError("No benchmark images found. Add held-out images and human-checked labels first.")
    prepared = []
    for path in images:
        with Image.open(path) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
        image.thumbnail((1568,1568))
        label_path = labels_dir / path.relative_to(images_dir).with_suffix(".txt")
        prepared.append((path, image.size, read_yolo_labels(label_path, detector.names, *image.size)))
    if not any(truth for _, _, truth in prepared):
        raise ValueError("Include labelled objects as well as empty images to measure recall and F1.")
    # Warm up each model once; report steady-state inference, excluding downloads/startup/Claude/network.
    with Image.open(images[0]) as opened:
        warmup = ImageOps.exif_transpose(opened).convert("RGB");warmup.thumbnail((1568,1568))
    detector.compare(warmup)
    records = []
    for path, size, truth in prepared:
        with Image.open(path) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
        image.thumbnail((1568,1568))
        batch = detector.compare(image)
        comparison = batch.comparison
        if comparison["status"] != "cross_checked":
            raise RuntimeError("Comparator failed during benchmark. Fix setup and rerun; partial results are not scored.")
        records.append({"image": path.relative_to(images_dir).as_posix(), "image_size": list(size), "truth": truth,
                        "primary": comparison["primary"], "comparator": comparison["comparator"], "fused": list(batch),
                        "timing_ms": comparison["timing_ms"], "review_count": len(comparison["review_candidates"])})
        if "custom" in comparison:records[-1]["custom"]=comparison["custom"]
    keys=["primary","comparator","fused"]+(["custom"] if "custom" in records[0] else [])
    scored = {key: detection_metrics(records, key) for key in keys}
    for key, timing_key in [(key,"total" if key=="fused" else key) for key in keys]:
        scored[key]["mean_inference_ms"] = round(sum(r["timing_ms"][timing_key] for r in records)/len(records), 2)
    report = {"images": len(records), "ground_truth_objects": sum(len(r["truth"]) for r in records),
              "iou_threshold": .5, "metrics": scored, "detector": detector.status(),
              "fused_f1_change_vs_primary": round(scored["fused"]["f1"]-scored["primary"]["f1"], 4),
              "notes": "Human labels determine accuracy. These are precision/recall/F1 at IoU 0.50, not COCO mAP. Each detector uses a 0.25 inference cutoff. The legacy fused key means YOLO-primary output with confidence support and optional custom-YOLO additions; it has no consensus rejection gate. Confidence support is heuristic, not a calibrated probability. Do not tune on this held-out test set. Latency excludes startup, Claude, image decoding and network."}
    if "custom" in keys:
        shared_ids=set(detector._names(detector.primary))
        shared=[{**{key:[r for r in record[key] if r["class_id"] in shared_ids] for key in keys},
                 "truth":[r for r in record["truth"] if r["class_id"] in shared_ids]} for record in records]
        report["shared_class_ground_truth_objects"]=sum(len(r["truth"]) for r in shared)
        report["shared_class_metrics"]={key:detection_metrics(shared,key) for key in keys} if report["shared_class_ground_truth_objects"] else None
        report["custom_note"]="Overall scores include the extended vocabulary; COCO detectors cannot predict those extra labels. Shared-class metrics compare the original COCO categories separately. Custom-only detections are unconfirmed and have their own retention threshold."
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir/"report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (output_dir/"predictions.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
    return report
