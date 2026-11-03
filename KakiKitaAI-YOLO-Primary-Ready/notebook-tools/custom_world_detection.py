"""Saved 61-label YOLO-World adapter and third-detector extension."""
import base64
import copy
import hashlib
import io
import json
import time
from pathlib import Path
from comparator_detection import ComparatorDetector, DetectionBatch, box_iou, clean_predictions, confidence_from_support

ALIASES = {"computer mouse":"mouse", "remote control":"remote", "water bottle":"bottle",
           "coffee mug":"cup", "charging cable":"cable", "shoes":"shoe", "pokemon toy":"pokemon",
           "snack packet":"snack", "hat":"cap", "litter":"trash"}


def canonical_label(label):
    value=label.strip().casefold()
    return ALIASES.get(value,value)


class SavedWorldAdapter:
    """Rebuild official architecture with data-only weights and the saved text embeddings."""
    def __init__(self, weights, metadata, expected_hash, expected_metadata_hash):
        import torch
        from safetensors.torch import load_file
        from ultralytics.nn.tasks import WorldModel
        from ultralytics.utils import DEFAULT_CFG_DICT
        weights=Path(weights);raw_metadata=Path(metadata).read_bytes()
        if hashlib.sha256(raw_metadata).hexdigest()!=expected_metadata_hash:raise ValueError("Custom vocabulary checksum mismatch.")
        metadata=json.loads(raw_metadata)
        if hashlib.sha256(weights.read_bytes()).hexdigest()!=expected_hash or metadata["weights_sha256"]!=expected_hash:
            raise ValueError("Custom weights checksum does not match this release.")
        labels=metadata["labels"]
        if len(labels)!=61 or len(set(labels))!=61 or any(not isinstance(s,str) or not s.strip() or len(s)>80 for s in labels):
            raise ValueError("Expected all 61 saved labels.")
        data=load_file(str(weights),device="cpu")
        features=data.pop("text_features")
        if tuple(features.shape)!=(1,len(labels),512):raise ValueError("Invalid saved label embeddings.")
        # Architecture is a trusted package constant, never executable checkpoint/YAML content.
        network=WorldModel("yolov8s-worldv2.yaml",ch=3,nc=len(labels),verbose=False)
        state={key.removeprefix("state."):value for key,value in data.items()}
        expected=network.state_dict()
        for index in range(3):
            key=f"model.22.cv4.{index}.bias"
            if state[key].shape==() and expected[key].shape==(1,):state[key]=state[key].reshape(1)
        network.load_state_dict(state,strict=True)
        network.txt_feats=features.float();network.names=dict(enumerate(labels))
        network.args={**DEFAULT_CFG_DICT,"task":"detect"};network.task="detect"
        self.network=network.float().eval();self.names=dict(enumerate(labels));self.predictor=None

    def predict(self, source, **kwargs):
        from ultralytics.models.yolo.detect import DetectionPredictor
        if self.predictor is None:
            self.predictor=DetectionPredictor(overrides={**kwargs,"task":"detect","mode":"predict","save":False})
        else:
            for key,value in kwargs.items():setattr(self.predictor.args,key,value)
        return self.predictor(source=source,model=self.network,stream=False)


class CustomVocabularyDetector(ComparatorDetector):
    def __init__(self, primary, comparator, custom, device="cpu", match_iou=.55, custom_min_conf=.25, load_error=None):
        super().__init__(primary,comparator,device,match_iou=match_iou,load_error=load_error)
        if not .25<=custom_min_conf<=1:raise ValueError("Custom confidence must be between .25 and 1.")
        self.custom=custom;self.custom_error=None;self.custom_min_conf=custom_min_conf
        self.custom_vocabulary=list(self._names(custom).values())
        self.names=dict(self.names)  # Never add labels to the underlying COCO model's names.
        self.ids=dict(self.ids)
        for label in self.custom_vocabulary:
            canonical=canonical_label(label)
            if canonical not in self.ids:
                index=max(self.names,default=-1)+1;self.names[index]=canonical;self.ids[canonical]=index
            self.ids[label.casefold()]=self.ids[canonical]

    def status(self):
        result=super().status()
        result.update(custom_model="yoloworld_custom",custom_ready=getattr(self,"custom_error",None) is None,
                      custom_label_count=len(getattr(self,"custom_vocabulary",[])),
                      custom_min_conf=getattr(self,"custom_min_conf",.25))
        return result

    def compare(self, image):
        with self.lock:
            total_started=time.perf_counter()
            batch=super().compare(image)
            metadata=copy.deepcopy(batch.comparison)
            final=copy.deepcopy(list(batch));primary_count=len(final)
            started=time.perf_counter();raw=[]
            if self.custom_error is None:
                try:
                    raw=clean_predictions(self._predict(self.custom,image),*image.size)
                    source_ids={name.casefold():i for i,name in self._names(self.custom).items()}
                    for item in raw:item["custom_class_id"]=source_ids[item["label"].casefold()]
                except Exception as exc:self.custom_error=type(exc).__name__
            elapsed=(time.perf_counter()-started)*1000
            custom=[];custom_reviews=[]
            for candidate in sorted(raw,key=lambda row:row["confidence"],reverse=True):
                # Only collapse near-identical synonym boxes, never same-label nearby YOLO objects.
                duplicate=next((r for r in custom if r["label"].casefold()!=candidate["label"].casefold()
                                and canonical_label(r["label"])==canonical_label(candidate["label"])
                                and box_iou(r["bbox_xyxy"],candidate["bbox_xyxy"])>=.90),None)
                if duplicate is not None:duplicate.setdefault("custom_aliases",[]).append(candidate["label"])
                else:custom.append(copy.deepcopy(candidate))
            used_primary=set()
            used_comparator={r["comparator_index"] for r in metadata.get("support_matches",[])}
            for candidate in custom:
                matches=[(box_iou(item["bbox_xyxy"],candidate["bbox_xyxy"]),i) for i,item in enumerate(final[:primary_count])
                         if i not in used_primary and canonical_label(item["label"])==canonical_label(candidate["label"])]
                overlap,index=max(matches,default=(0,-1))
                if overlap>=self.match_iou:
                    item=final[index];used_primary.add(index)
                    item["source_scores"]["custom"]=candidate["confidence"]
                    item["custom_labels"]=[candidate["label"]]+candidate.get("custom_aliases",[])
                    item["agreement"]="all_three" if len(item["source_scores"])==3 else "primary+custom"
                    item["needs_review"]=item.get("review_reason")=="label_disagreement"
                else:
                    if any(canonical_label(item["label"])==canonical_label(candidate["label"])
                           and box_iou(item["bbox_xyxy"],candidate["bbox_xyxy"])>=.90 for item in final[:primary_count]):
                        custom_reviews.append({**candidate,"needs_review":True,"review_reason":"overlaps_main_yolo"});continue
                    if candidate["confidence"]<self.custom_min_conf:
                        custom_reviews.append({**candidate,"needs_review":True,"review_reason":"custom_below_threshold"});continue
                    item={**candidate,"bbox_xyxy":list(candidate["bbox_xyxy"]),"anchor_model":"custom_yolo",
                          "yolo_confidence":candidate["confidence"],"agreement":"custom_only","needs_review":True,
                          "source_scores":{"custom":candidate["confidence"]},
                          "custom_labels":[candidate["label"]]+candidate.get("custom_aliases",[])}
                    matches=[(box_iou(row["bbox_xyxy"],candidate["bbox_xyxy"]),j) for j,row in enumerate(metadata["comparator"])
                             if j not in used_comparator and canonical_label(row["label"])==canonical_label(candidate["label"])]
                    support_iou,j=max(matches,default=(0,-1))
                    if support_iou>=self.match_iou:
                        item["source_scores"]["comparator"]=metadata["comparator"][j]["confidence"]
                        item["agreement"]="custom+comparator";used_comparator.add(j)
                    final.append(item)
            for item in final:
                item["confidence"]=confidence_from_support(item["yolo_confidence"],item["source_scores"])
                item["confidence_adjustment"]=item["confidence"]-item["yolo_confidence"]
                item["confidence_percent"]=round(item["confidence"]*100,1)
                item["model_count"]=len(item["source_scores"])
                item["custom_supported"]="custom" in item["source_scores"]
                item["custom_in_vocabulary"]=canonical_label(item["label"]) in {canonical_label(label) for label in self.custom_vocabulary}
            metadata.update(custom=raw,custom_review_candidates=custom_reviews,custom_vocabulary=list(self.custom_vocabulary),models=self.status())
            metadata["timing_ms"]["custom"]=round(elapsed,2)
            metadata["timing_ms"]["total"]=round((time.perf_counter()-total_started)*1000,2)
            metadata["agreed_count"]=sum(len(item["source_scores"])>=2 for item in final)
            metadata["primary_retained_count"]=primary_count
            metadata["custom_yolo_added_count"]=len(final)-primary_count
            metadata["review_count"]=sum(item["needs_review"] for item in final)
            metadata["status"]="degraded_custom_unavailable" if self.custom_error else "cross_checked" if self.status()["comparator_ready"] else "cross_checked_partial"
            metadata["custom_note"]="Main YOLO labels, boxes and detections are preserved. Saved YOLO-World adds extra labels; other detectors only add support. Hazard/obstacle prompt matches do not prove hazards, safety, disability or accessibility."
            return DetectionBatch(final,metadata)

    def __call__(self, image):
        batch=self.compare(image)
        active=1+int(self.status()["comparator_ready"])+int(self.custom_error is None)
        title=(f"Custom labels OFF | {active} base model(s)" if self.custom_error else
               f"YOLO primary | {len(batch)} items | {batch.comparison['agreed_count']} supported")
        paint_order=[r for r in batch if r["anchor_model"]=="custom_yolo"]+[r for r in batch if r["anchor_model"]=="primary_yolo"]
        picture=self.annotate(image,paint_order,title);buffer=io.BytesIO();picture.save(buffer,format="JPEG",quality=88)
        return batch,base64.b64encode(buffer.getvalue()).decode("ascii")
