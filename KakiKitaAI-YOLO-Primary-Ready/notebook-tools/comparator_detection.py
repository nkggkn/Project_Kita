"""YOLO owns detections; a second detector only supplies uncalibrated confidence support."""
import base64
import io
import math
import threading
import time

from PIL import ImageDraw, ImageFont


class DetectionBatch(list):
    """Keep the existing list API and attach per-image diagnostics without global state."""
    def __init__(self, values, comparison):
        super().__init__(values)
        self.comparison = comparison


def box_iou(a, b):
    intersection = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    union = max(0, a[2] - a[0]) * max(0, a[3] - a[1]) + max(0, b[2] - b[0]) * max(0, b[3] - b[1]) - intersection
    return intersection / union if union > 0 else 0.0


def clean_predictions(rows, width, height):
    cleaned = []
    for row in rows:
        try:
            score = float(row["confidence"])
            box = [float(x) for x in row["bbox_xyxy"]]
            label, class_id = row["label"], int(row["class_id"])
            if len(box) != 4 or not all(math.isfinite(x) for x in box + [score]):
                continue
            if not 0 <= score <= 1 or class_id < 0 or not isinstance(label, str) or not label.strip():
                continue
            box = [min(width, max(0, box[0])), min(height, max(0, box[1])),
                   min(width, max(0, box[2])), min(height, max(0, box[3]))]
            if box[2] <= box[0] or box[3] <= box[1]:
                continue
            cleaned.append({"label": label.strip(), "class_id": class_id,
                            "confidence": score, "bbox_xyxy": box})
        except (KeyError, TypeError, ValueError, OverflowError):
            continue
    return cleaned


def confidence_from_support(yolo_confidence, source_scores):
    """A support score may rise, never fall below the anchor YOLO score; it is not calibrated."""
    best=max(source_scores.values(),default=yolo_confidence)
    return max(yolo_confidence, (yolo_confidence+best)/2)


def fuse_predictions(primary, comparator, width, height, match_iou=0.55):
    """Legacy API name: retain every valid YOLO result; secondary detections only support it."""
    if width <= 0 or height <= 0 or not 0 < match_iou <= 1:
        raise ValueError("Invalid image size or matching threshold.")
    raw_counts=(len(primary),len(comparator))
    primary=clean_predictions(primary,width,height)
    comparator=clean_predictions(comparator,width,height)
    pairs=[]
    for i,a in enumerate(primary):
        for j,b in enumerate(comparator):
            overlap=box_iou(a["bbox_xyxy"],b["bbox_xyxy"])
            if a["label"].casefold()==b["label"].casefold() and overlap>=match_iou:
                pairs.append((overlap,i,j))
    matches={};used_b=set()
    for overlap,i,j in sorted(pairs,reverse=True):
        if i not in matches and j not in used_b:
            matches[i]=(j,overlap);used_b.add(j)
    final=[];conflicts=[];support_matches=[]
    for i,a in enumerate(primary):
        item={**a,"bbox_xyxy":list(a["bbox_xyxy"]),"yolo_confidence":a["confidence"],
              "anchor_model":"primary_yolo","source_scores":{"primary":a["confidence"]},
              "agreement":"primary_only","needs_review":True,"primary_index":i}
        if i in matches:
            j,overlap=matches[i]
            item["source_scores"]["comparator"]=comparator[j]["confidence"]
            item.update(agreement="both",needs_review=False,match_iou=round(overlap,4))
            support_matches.append({"primary_index":i,"comparator_index":j})
        for j,b in enumerate(comparator):
            if j not in used_b and a["label"].casefold()!=b["label"].casefold() and box_iou(a["bbox_xyxy"],b["bbox_xyxy"])>=.70:
                conflicts.append({"primary":a,"comparator":b,"primary_index":i,"comparator_index":j})
                item.update(needs_review=True,review_reason="label_disagreement")
        item["confidence"]=confidence_from_support(a["confidence"],item["source_scores"])
        item["confidence_percent"]=round(item["confidence"]*100,1)
        item["confidence_adjustment"]=item["confidence"]-a["confidence"]
        final.append(item)
    review=[{**row,"agreement":"comparator_only","needs_review":True,"review_reason":"support_model_only"}
            for j,row in enumerate(comparator) if j not in used_b]
    return DetectionBatch(final,{
        "status":"cross_checked","policy":"yolo_primary_support_only","primary":primary,"comparator":comparator,
        "agreed_count":len(matches),"primary_retained_count":len(final),"single_model_retained":len(final)-len(matches),
        "review_count":sum(row["needs_review"] for row in final),"review_candidates":review,
        "label_disagreements":conflicts,"support_matches":support_matches,
        "agreement_fraction":len(matches)/len(primary) if primary else None,
        "invalid_predictions":{"primary":raw_counts[0]-len(primary),"comparator":raw_counts[1]-len(comparator)},
        "settings":{"yolo_confidence_threshold":.25,"match_iou":match_iou,"comparator_can_veto":False,"comparator_can_add_objects":False},
        "score_note":"YOLO labels and boxes are authoritative. A higher supporting score can raise the display score halfway toward it; it is a heuristic, not a calibrated probability. Missing/disagreeing support never removes YOLO objects.",
    })


class ComparatorDetector:
    def __init__(self, primary, comparator, device="cpu", primary_name="yolov8n.pt", comparator_name="rtdetr-l.pt",
                 match_iou=.55, load_error=None):
        self.primary, self.comparator, self.device = primary, comparator, device
        self.primary_name, self.comparator_name = primary_name, comparator_name
        self.match_iou = match_iou
        self.comparator_error = load_error
        self.lock = threading.RLock()
        self.names = self._names(primary)
        self.ids = {name.casefold(): int(i) for i, name in self.names.items()}
        if comparator is not None and set(self.ids) != {x.casefold() for x in self._names(comparator).values()}:
            raise ValueError("Use detectors trained on the same class labels (the supplied COCO weights match).")

    @staticmethod
    def _names(model):
        return model.names if isinstance(model.names, dict) else dict(enumerate(model.names))

    def status(self):
        return {"primary_model": self.primary_name, "comparator_model": self.comparator_name,
                "comparator_ready": self.comparator is not None and self.comparator_error is None,
                "comparator_error": self.comparator_error,
                "policy": "yolo_primary_support_only", "match_iou": self.match_iou,
                "yolo_confidence_threshold": .25, "comparator_can_veto": False}

    def _predict(self, model, image):
        result = model.predict(source=image, conf=.25, imgsz=640, max_det=100, device=self.device, verbose=False)[0]
        if result.boxes is None:
            return []
        names = self._names(model)
        rows = []
        for class_id, confidence, box in zip(result.boxes.cls.cpu().tolist(), result.boxes.conf.cpu().tolist(), result.boxes.xyxy.cpu().tolist()):
            label = names[int(class_id)]
            rows.append({"label": label, "class_id": self.ids[label.casefold()],
                         "confidence": confidence, "bbox_xyxy": box})
        return rows

    def compare(self, image):
        with self.lock:
            started = time.perf_counter()
            primary = self._predict(self.primary, image)
            primary_done = time.perf_counter()
            comparator = []
            if self.status()["comparator_ready"]:
                try:
                    comparator = self._predict(self.comparator, image)
                except Exception as exc:
                    # Disable repeat failures until setup is rerun; never claim two-model agreement.
                    self.comparator_error = type(exc).__name__
            comparator_done = time.perf_counter()
            if self.status()["comparator_ready"]:
                batch = fuse_predictions(primary, comparator, *image.size, self.match_iou)
            else:
                batch = fuse_predictions(primary, [], *image.size, self.match_iou)
                for row in batch:
                    row["agreement"] = "primary_only_fallback"
                batch.comparison.update(status="degraded_primary_only", warning="Supporting model unavailable. All YOLO detections are retained.")
            ended = time.perf_counter()
            batch.comparison.update(models=self.status(),
                                    timing_ms={"primary": round((primary_done-started)*1000, 2),
                                               "comparator": round((comparator_done-primary_done)*1000, 2),
                                               "fusion": round((ended-comparator_done)*1000, 2),
                                               "total": round((ended-started)*1000, 2)})
            return batch

    @staticmethod
    def annotate(image, detections, title="Two-model check"):
        picture = image.convert("RGB").copy()
        draw = ImageDraw.Draw(picture)
        size = max(12, min(26, picture.width // 38))
        try:
            font = ImageFont.truetype("DejaVuSans.ttf", size)
        except OSError:
            font = ImageFont.load_default()
        for row in detections:
            box = row["bbox_xyxy"]
            review = row.get("needs_review", False)
            color = "#b35b00" if review else "#215cb0"
            draw.rectangle(box, outline=color, width=3)
            text = ("Review: " if review else "") + row["label"] + f" {row['confidence']:.0%}"
            bounds = draw.textbbox((0, 0), text, font=font)
            x = max(0, min(box[0], picture.width - (bounds[2]+8)))
            y = max(0, min(picture.height-size-8, max(size+10, box[1]-size-8)))
            draw.rectangle((x, y, min(picture.width, x+bounds[2]+8), min(picture.height, y+size+8)), fill=color)
            draw.text((x+4, y+2), text, font=font, fill="white")
        draw.rectangle((0, 0, picture.width, size+10), fill="#173f78")
        draw.text((6, 3), title, font=font, fill="white")
        return picture

    def __call__(self, image):
        batch = self.compare(image)
        title = (f"YOLO primary | {len(batch)} objects | {batch.comparison['agreed_count']} supported"
                 if batch.comparison["status"] == "cross_checked" else "ONE MODEL ONLY | comparator unavailable")
        picture = self.annotate(image, batch, title)
        buffer = io.BytesIO();picture.save(buffer, format="JPEG", quality=88)
        return batch, base64.b64encode(buffer.getvalue()).decode("ascii")
