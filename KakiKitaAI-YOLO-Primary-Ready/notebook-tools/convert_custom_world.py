"""Inspect a known checkpoint with restricted loading; export data-only deployment weights."""
import hashlib
import io
import json
import pickletools
import sys
import zipfile
from pathlib import Path

EXPECTED_SHA256 = "56fb85dcf554d3f59692ef72c09031cb93c4aaa7f38fe875805cf73e65e8fff3"
ROOT = Path(__file__).resolve().parents[1]


def convert(path, output):
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED_SHA256:
        raise ValueError("This is not the supplied checkpoint; conversion stopped.")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        member = next(n for n in archive.namelist() if n.endswith("/data.pkl"))
        if archive.getinfo(member).file_size > 2_000_000:
            raise ValueError("Unexpected checkpoint metadata size.")
        operations = list(pickletools.genops(archive.read(member)))
    approved = {
        "__builtin__ set", "collections OrderedDict", "torch FloatStorage", "torch HalfStorage", "torch LongStorage",
        "torch._utils _rebuild_parameter", "torch._utils _rebuild_tensor_v2",
        "torch.nn.modules.activation SiLU", "torch.nn.modules.batchnorm BatchNorm2d",
        "torch.nn.modules.container ModuleList", "torch.nn.modules.container Sequential",
        "torch.nn.modules.conv Conv2d", "torch.nn.modules.linear Identity", "torch.nn.modules.linear Linear",
        "torch.nn.modules.pooling MaxPool2d", "torch.nn.modules.upsampling Upsample",
        "ultralytics.nn.modules.block BNContrastiveHead", "ultralytics.nn.modules.block Bottleneck",
        "ultralytics.nn.modules.block C2f", "ultralytics.nn.modules.block C2fAttn",
        "ultralytics.nn.modules.block DFL", "ultralytics.nn.modules.block MaxSigmoidAttnBlock",
        "ultralytics.nn.modules.block SPPF", "ultralytics.nn.modules.conv Concat", "ultralytics.nn.modules.conv Conv",
        "ultralytics.nn.modules.head WorldDetect", "ultralytics.nn.tasks WorldModel",
    }
    for op, value, _ in operations:
        if op.name == "GLOBAL" and value not in approved or op.name in {"STACK_GLOBAL", "INST", "OBJ", "EXT1", "EXT2", "EXT4"}:
            raise ValueError("Unrecognized executable checkpoint symbol; conversion stopped.")
    import torch
    from torch import nn
    from ultralytics.nn import modules
    from ultralytics.nn.tasks import WorldModel
    from safetensors.torch import save_file
    torch.set_num_threads(2)
    safe = [set, nn.SiLU, nn.BatchNorm2d, nn.ModuleList, nn.Sequential, nn.Conv2d, nn.Identity,
            nn.Linear, nn.MaxPool2d, nn.Upsample, WorldModel]
    safe += [getattr(modules, name) for name in ["BNContrastiveHead", "Bottleneck", "C2f", "C2fAttn", "DFL",
             "MaxSigmoidAttnBlock", "SPPF", "Concat", "Conv", "WorldDetect"]]
    with torch.serialization.safe_globals(safe):
        checkpoint = torch.load(io.BytesIO(raw), map_location="cpu", weights_only=True)
    network = checkpoint["model"]
    if type(network) is not WorldModel:
        raise ValueError("Expected a YOLO-World model.")
    names = network.names
    labels = list(names) if isinstance(names, list) else [names[i] for i in range(len(names))]
    if len(labels) != 61 or len(set(labels)) != 61 or any(not isinstance(s, str) or not s.strip() or len(s) > 80 for s in labels):
        raise ValueError("Unexpected custom vocabulary.")
    features = network.txt_feats.detach().cpu().contiguous().clone()
    if tuple(features.shape) != (1,61,512) or not torch.isfinite(features).all():
        raise ValueError("Saved vocabulary embeddings are invalid.")
    for layer in network.modules():
        layer._state_dict_hooks = {}
        layer._state_dict_pre_hooks = {}
    state = {"state."+key:value.detach().cpu().contiguous().clone() for key,value in network.state_dict().items()}
    state["text_features"] = features
    if any(value.is_floating_point() and not torch.isfinite(value).all() for value in state.values()):
        raise ValueError("Non-finite model weights.")
    output = Path(output);output.mkdir(parents=True,exist_ok=True)
    weights = output/"yoloworld_custom.safetensors"
    save_file(state, str(weights))
    metadata = {"architecture":"yolov8s-worldv2.yaml", "ultralytics_version":"8.4.198",
                "source_sha256":EXPECTED_SHA256, "weights_sha256":hashlib.sha256(weights.read_bytes()).hexdigest(),
                "labels":labels, "text_features_shape":list(features.shape),
                "note":"Saved open-vocabulary prompt labels; these do not prove fine-tuning or hazard accuracy."}
    (output/"custom_labels.json").write_text(json.dumps(metadata,indent=2),encoding="utf-8")
    print(json.dumps({"labels":labels,"count":len(labels),"weights_bytes":weights.stat().st_size,
                      "weights_sha256":metadata["weights_sha256"]},indent=2))


if __name__ == "__main__":
    convert(sys.argv[1], ROOT/"downloads/custom-model")
