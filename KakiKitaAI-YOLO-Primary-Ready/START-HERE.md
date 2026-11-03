# Kaki Kita — YOLO primary, confidence support and 61 custom labels

The model weights and its complete saved label vocabulary are included in this ZIP.
Your existing YOLOv8n + RT-DETR-L backend is preserved as a reference.

## Start

1. Extract this ZIP on your computer.
2. In Google Colab, open **KakiKitaAI_YOLO_Primary_Colab.ipynb** from the extracted folder.
3. Select a GPU runtime and enable your existing Anthropic/ngrok secrets.
4. Stop the old notebook/tunnel. Run all in the new notebook.
5. When asked for the model bundle, upload the original
   **KakiKitaAI-YOLO-Primary-Ready.zip**. Your previous custom-label ready ZIP also
   works: model weights are unchanged. Upload the ZIP, not the original .pt file.
   Only the supplied weight and vocabulary files are read from it. Later runs in
   the same runtime reuse those files.
6. Check health: `custom_ready: True`, `custom_label_count: 61`.
7. Use the printed API URL and private live token in your current Android app.
   Reveal the token in the last notebook cell. Keep tokens and passwords private.

No new API provider/key is needed. Claude keeps its existing configuration and
optional-report limits. Photo, video-frame, Android live, USB/browser webcam and
YouTube inputs all use the same detector pipeline. Stream stop/timeout handling
is retained. No camera or paid image test starts automatically.

## Labels and result handling

All 61 saved prompt labels and text embeddings are preserved. The original file
is not overwritten. A data-only safetensors copy is used for Colab deployment;
the exact label/weight files are checked with SHA-256. Three one-element bias
shapes are normalized for the official architecture without changing their values.

YOLOv8n is the main detector. Every valid primary detection at the original
**0.25** cutoff is kept, including nearby and overlapping items. Its label and box
are never changed by another model. RT-DETR provides confidence support only;
it cannot remove primary objects or add its own checklist items. Missing or
conflicting support is diagnostic, never a rejection gate.

The saved YOLO-World adds custom-label YOLO detections at **0.25**. New items are
marked `custom_only` and `needs_review`. A COCO model's lack of that class is not
a negative vote. Main YOLO detections remain first and are drawn on top.

Raw `yolo_confidence` is retained. When a same-label box matches at IoU **0.55**,
a higher supporting score may raise the displayed score halfway toward the best
support score; it cannot lower YOLO's confidence. The displayed score is heuristic,
not a calibrated probability. A weaker third model cannot undo an earlier boost.

Known synonyms such as cable/charging cable are grouped only for near-identical
boxes (IoU >= 0.90). No extra same-label NMS removes nearby items. One model never
counts as two votes. All original names and IDs remain in raw custom diagnostics.

The previous 0.65 single-model gate and 0.35 custom-only threshold are removed.
Lower thresholds can also retain false positives; review detections in your rooms.

Labels such as hazard, obstacle, tripping hazard or wheelchair are uncertain
visual prompt matches. They do not prove hazards, safety, accessibility, a
person's disability, or custom-model training accuracy. Orange boxes need review.
This saved vocabulary alone does not demonstrate fine-tuning or better accuracy.

If custom inference fails, health says `custom_ready: false` and the annotated
image says **Custom labels OFF**. The other detectors continue. Rerun the
custom-model cell to recover; failures are never represented as three-model agreement.

## All saved labels

person, cell phone, laptop, coffee mug, bottle, water bottle, cup, tissue box,
tissues, snack, snack packet, cap, hat, camera, cable, charging cable, ring, shoe,
shoes, whiteboard, umbrella, pokemon, pokemon toy, keyboard, computer mouse,
headphones, glasses, book, pen, backpack, bag, wallet, keys, watch, scissors,
remote control, chair, laundry, clothes, trash, litter, trash can, wheelchair,
crutches, walker, stroller, white cane, stairs, curb, ramp, tactile paving,
traffic cone, construction barrier, pothole, tripping hazard, hazard, obstacle,
bicycle, scooter, door, elevator.

## API and evaluation

- `yolo.detections`: combined app-compatible objects.
- `comparison.custom`: exact custom label names, mapped IDs, original `custom_class_id`.
- `comparison.custom_vocabulary`: all 61 names.
- Detection `agreement`, `model_count`, `source_scores`, `needs_review`: supporting evidence.
- Detection `yolo_confidence`, `anchor_model`: original YOLO score and source.
- `comparison.primary_retained_count`: count of main YOLO objects preserved.
- `/health`: model readiness, saved labels and the combined class map.
- Live status / JSONL logs: comparison data for that exact frame.

**Benchmark IDs differ from the custom checkpoint's original 0–60 IDs.** Use
`MODEL-CLASS-MAP.json` (119 canonical classes) for new benchmark annotations.
It is also written under `/content/kakikita_models/` during setup. Never merge
class IDs from different model vocabularies directly.

The notebook's optional photo comparison makes no Claude call. The held-out
benchmark compares main, comparator, custom and combined outputs, with a separate
shared-COCO table so added vocabulary is not confused with improved common-object
accuracy. Provide human-checked YOLO labels. Precision/recall/F1 are at IoU 0.50;
this is not official COCO mAP. A third detector adds processing time.

## Editing and verification

The notebook is self-contained after the included model bundle is uploaded.
Python implementation/generator/test files are under `notebook-tools/` for editing.
Original reference notebooks are under `downloads/`. Rebuild the custom notebook
with `python notebook-tools/create_custom_world_notebook.py`.

Tests cover nearby/low-confidence objects, conflicts, score floors, custom-label
retention, photo/private-live APIs and stop handling. `models/SMOKE-VERIFICATION.json`
records the real CPU test and primary-preservation checks. No paid provider calls
or private camera feeds are used. Room accuracy, Colab GPU speed and physical-camera
behavior with this update still need validation.

[YOLO-World saved vocabulary documentation](https://docs.ultralytics.com/models/yolo-world/)
