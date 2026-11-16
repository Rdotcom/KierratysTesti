"""Synthetic-only diagnosis; no photo fitting or acceptance gate changes."""
import hashlib
import json
from pathlib import Path
import sys


def sha(file):
    h = hashlib.sha256()
    with file.open("rb") as stream:
        while part := stream.read(1024 * 1024):
            h.update(part)
    return h.hexdigest()


root = Path(__file__).resolve().parents[2]
run = (root / sys.argv[1]).resolve(strict=True)
assert run.is_relative_to(root / "work")
lock = json.loads((run / "precision-lock.json").read_bytes())
for file, digest in lock["pins"].items():
    p = root / file
    assert p.resolve(strict=True) == p and sha(p) == digest
out = run / "precision"
with (out / "attempt.json").open("x") as stream:
    json.dump({"lockSha256": sha(run / "precision-lock.json")}, stream)
sys.path.insert(0, str(run / "conversion-deps"))
sys.path.insert(0, str(run / "numpy-compat"))
import numpy as np
import torch
import coremltools as ct
from transformers import AutoConfig, SiglipVisionModel
from safetensors.torch import load_file
torch.set_num_threads(2)
torch.set_num_interop_threads(1)
torch.set_grad_enabled(False)
torch.backends.mha.set_fastpath_enabled(False)
config = AutoConfig.from_pretrained(str(root / lock["modelDirectory"]), local_files_only=True, trust_remote_code=False).vision_config
config._attn_implementation = "eager"
vision = SiglipVisionModel(config).eval()
vision.load_state_dict(load_file(str(run / "vision-fp32.safetensors")), strict=True)


class Encoder(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = vision
    def forward(self, pixels):
        return self.encoder(pixel_values=pixels, return_dict=False)[1]


encoder = Encoder().eval()
inputs = [torch.zeros(1, 3, 224, 224), torch.linspace(-1, 1, 3 * 224 * 224).reshape(1, 3, 224, 224)]
traced = torch.jit.trace(encoder, inputs[0], check_trace=False)
references = [encoder(x).numpy().reshape(-1).astype(np.float64) for x in inputs]


def compare(value, reference):
    v, r = value.reshape(-1).astype(np.float64), reference
    v, r = v / np.linalg.norm(v), r / np.linalg.norm(r)
    return {"cosine": float(v @ r), "maxAbs": float(np.max(np.abs(v - r)))}


results = {"traced": [compare(traced(x).numpy(), r) for x, r in zip(inputs, references)]}
models = {"old-fp16": run / "recovery-v2/vision-fp16.mlpackage"}
for name, precision in [("fp32", ct.precision.FLOAT32), ("mixed", ct.transform.FP16ComputePrecision(op_selector=lambda op: op.op_type in {"linear", "conv"}))]:
    model = ct.convert(traced, convert_to="mlprogram", minimum_deployment_target=ct.target.iOS17,
        inputs=[ct.TensorType(name="pixel_values", shape=(1, 3, 224, 224), dtype=np.float32)],
        outputs=[ct.TensorType(name="embedding", dtype=np.float32)], compute_precision=precision, skip_model_load=True)
    package = out / (name + ".mlpackage")
    model.save(str(package))
    models[name] = package
for name, package in models.items():
    model = ct.models.MLModel(str(package), compute_units=ct.ComputeUnit.CPU_ONLY)
    results[name] = [compare(model.predict({"pixel_values": x.numpy()})["embedding"], r) for x, r in zip(inputs, references)]
    del model
with (out / "results.json").open("x") as stream:
    json.dump(results, stream, allow_nan=False, indent=2)
