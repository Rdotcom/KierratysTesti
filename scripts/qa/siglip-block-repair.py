"""Single selective block32 candidate; strict synthetic/photo gates unchanged."""
import hashlib
import json
from pathlib import Path
import re
import sys
import time


def sha(file):
    h = hashlib.sha256()
    with file.open("rb") as stream:
        while part := stream.read(1024 * 1024):
            h.update(part)
    return h.hexdigest()


def write(file, value):
    with file.open("x") as stream:
        json.dump(value, stream, allow_nan=False, indent=2)


root = Path(__file__).resolve().parents[2]
run = (root / sys.argv[1]).resolve(strict=True)
assert run.is_relative_to(root / "work")
lock = json.loads((run / "block-lock.json").read_bytes())
for file, digest in lock["pins"].items():
    p = root / file
    assert p.resolve(strict=True) == p and sha(p) == digest
out = run / "block"
write(out / "attempt.json", {"lockSha256": sha(run / "block-lock.json")})
sys.path.insert(0, str(run / "conversion-deps"))
sys.path.insert(0, str(run / "numpy-compat"))
import numpy as np
import torch
import coremltools as ct
import coremltools.optimize.coreml as cto
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
probes = [torch.zeros(1, 3, 224, 224), torch.linspace(-1, 1, 3 * 224 * 224).reshape(1, 3, 224, 224)]
traced = torch.jit.trace(encoder, probes[0], check_trace=False)
model = ct.convert(traced, convert_to="mlprogram", minimum_deployment_target=ct.target.iOS18,
    inputs=[ct.TensorType(name="pixel_values", shape=(1, 3, 224, 224), dtype=np.float32)],
    outputs=[ct.TensorType(name="embedding", dtype=np.float32)], compute_precision=ct.precision.FLOAT32, skip_model_load=True)
pattern = re.compile(r"encoder_encoder_layers_\d+_(?:self_attn_(?:q|k|v|out)_proj|mlp_fc[12])_weight$")
names = [op.name for op in model._mil_program.functions["main"].operations if op.op_type == "const" and pattern.fullmatch(op.name)]
assert len(names) == 72 and len(set(names)) == 72
quantizer = cto.OpLinearQuantizerConfig(mode="linear_symmetric", dtype="int8", granularity="per_block", block_size=32, weight_threshold=512)
compressed = cto.linear_quantize_weights(model, config=cto.OptimizationConfig(global_config=None, op_name_configs={name: quantizer for name in names}))
package = out / "vision-int8-block32.mlpackage"
compressed.save(str(package))
pins = {str(p.relative_to(root)): sha(p) for p in package.rglob("*") if p.is_file()}
write(out / "export-pins.json", pins)
write(out / "compressed-constants.json", sorted(names))
candidate = ct.models.MLModel(str(package), compute_units=ct.ComputeUnit.CPU_ONLY)


def unit(raw):
    v = np.asarray(raw, dtype=np.float64).reshape(-1)
    assert v.shape == (768,) and np.isfinite(v).all() and np.linalg.norm(v) > 0
    return v / np.linalg.norm(v)


synthetic = []
for x in probes:
    r = unit(encoder(x).numpy())
    v = unit(candidate.predict({"pixel_values": x.numpy()})["embedding"])
    synthetic.append({"cosine": float(v @ r), "maxAbs": float(np.max(np.abs(v - r)))})
passed = all(r["cosine"] >= 0.995 for r in synthetic)
write(out / "synthetic.json", {"rows": synthetic, "passed": passed})
if not passed:
    sys.exit(2)
baseline = json.loads((run / "baseline.json").read_bytes())
prototypes = np.asarray(json.loads((run / "text-prototypes.json").read_bytes())["vectors"], dtype=np.float64)
rows = []
for row in lock["rows"]:
    start = time.perf_counter()
    observed = {"id": row["id"], "failure": None}
    try:
        v = unit(candidate.predict({"pixel_values": np.load(run / (row["id"] + "-input.npy"), allow_pickle=False)})["embedding"])
        scores = prototypes @ v
        r = next(b for b in baseline if b["id"] == row["id"])
        observed.update(vector=v.tolist(), scores=scores.tolist(), top1=lock["classes"][int(np.argmax(scores))], embeddingCosine=float(v @ np.asarray(r["vector"])), maxScoreError=float(np.max(np.abs(scores - np.asarray(r["scores"])))))
    except Exception as exc:
        observed["failure"] = type(exc).__name__
    observed["durationMs"] = round((time.perf_counter() - start) * 1000)
    rows.append(observed)
    write(out / (row["id"] + ".json"), observed)
write(out / "results.json", {"rows": rows, "resourcesBytes": sum(p.stat().st_size for p in package.rglob("*") if p.is_file()) + (run / "text-prototypes.json").stat().st_size})
