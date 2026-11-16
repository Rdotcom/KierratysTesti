"""Keep FP32 compute, compress weights; single registered engineering repair."""
import hashlib
import json
from pathlib import Path
import sys
import time


def sha(file):
    h = hashlib.sha256()
    with file.open("rb") as stream:
        while part := stream.read(1024 * 1024):
            h.update(part)
    return h.hexdigest()


root = Path(__file__).resolve().parents[2]
run = (root / sys.argv[2]).resolve(strict=True)
assert run.is_relative_to(root / "work")
lock = json.loads((run / "storage-lock.json").read_bytes())
for file, digest in lock["pins"].items():
    p = root / file
    assert p.resolve(strict=True) == p and sha(p) == digest
out = run / "storage"
with (out / (sys.argv[1] + "-attempt.json")).open("x") as stream:
    json.dump({"lockSha256": sha(run / "storage-lock.json")}, stream)
sys.path.insert(0, str(run / "conversion-deps"))
sys.path.insert(0, str(run / "numpy-compat"))
import numpy as np
import coremltools as ct


def vector(raw):
    v = np.asarray(raw, dtype=np.float64).reshape(-1)
    assert v.shape == (768,) and np.isfinite(v).all() and np.linalg.norm(v) > 0
    return v / np.linalg.norm(v)


package = out / "vision-int8-fp32.mlpackage"
if sys.argv[1] == "convert":
    import coremltools.optimize.coreml as cto
    model = ct.models.MLModel(str(run / "precision/fp32.mlpackage"), skip_model_load=True)
    compressed = cto.linear_quantize_weights(model, config=cto.OptimizationConfig(global_config=cto.OpLinearQuantizerConfig(mode="linear_symmetric", dtype="int8", granularity="per_channel", weight_threshold=512)))
    compressed.save(str(package))
    reference = ct.models.MLModel(str(run / "precision/fp32.mlpackage"), compute_units=ct.ComputeUnit.CPU_ONLY)
    candidate = ct.models.MLModel(str(package), compute_units=ct.ComputeUnit.CPU_ONLY)
    probes = [np.zeros((1, 3, 224, 224), dtype=np.float32), np.linspace(-1, 1, 3 * 224 * 224, dtype=np.float32).reshape(1, 3, 224, 224)]
    rows = []
    for x in probes:
        r = vector(reference.predict({"pixel_values": x})["embedding"])
        v = vector(candidate.predict({"pixel_values": x})["embedding"])
        rows.append({"cosine": float(v @ r), "maxAbs": float(np.max(np.abs(v - r)))})
    with (out / "synthetic.json").open("x") as stream:
        json.dump({"rows": rows, "passed": all(r["cosine"] >= 0.995 for r in rows)}, stream, allow_nan=False, indent=2)
elif sys.argv[1] == "evaluate":
    assert json.loads((out / "synthetic.json").read_bytes())["passed"]
    model = ct.models.MLModel(str(package), compute_units=ct.ComputeUnit.CPU_ONLY)
    baseline = json.loads((run / "baseline.json").read_bytes())
    prototypes = np.asarray(json.loads((run / "text-prototypes.json").read_bytes())["vectors"], dtype=np.float64)
    rows = []
    for row in lock["rows"]:
        start = time.perf_counter()
        observed = {"id": row["id"], "failure": None}
        try:
            v = vector(model.predict({"pixel_values": np.load(run / (row["id"] + "-input.npy"), allow_pickle=False)})["embedding"])
            scores = prototypes @ v
            r = next(b for b in baseline if b["id"] == row["id"])
            observed.update(vector=v.tolist(), scores=scores.tolist(), top1=lock["classes"][int(np.argmax(scores))], embeddingCosine=float(v @ np.asarray(r["vector"])), maxScoreError=float(np.max(np.abs(scores - np.asarray(r["scores"])))))
        except Exception as exc:
            observed["failure"] = type(exc).__name__
        observed["durationMs"] = round((time.perf_counter() - start) * 1000)
        rows.append(observed)
        with (out / (row["id"] + ".json")).open("x") as stream:
            json.dump(observed, stream, allow_nan=False)
    result = {"rows": rows, "resourcesBytes": sum(p.stat().st_size for p in package.rglob("*") if p.is_file()) + (run / "text-prototypes.json").stat().st_size}
    with (out / "results.json").open("x") as stream:
        json.dump(result, stream, allow_nan=False, indent=2)
else:
    raise ValueError("unknown_stage")
