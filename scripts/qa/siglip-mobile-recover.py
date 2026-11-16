"""Converter-only compatibility repair; reuse all frozen real-image references."""
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


def main():
    root = Path(__file__).resolve().parents[2]
    run = (root / sys.argv[2]).resolve(strict=True)
    lock = json.loads((run / "recovery-v2-lock.json").read_bytes())
    if not run.is_relative_to(root / "work"):
        raise ValueError("outside_work")
    for file, digest in lock["pins"].items():
        p = root / file
        if p.resolve(strict=True) != p or sha(p) != digest:
            raise ValueError("input_drift")
    output = run / "recovery-v2"
    with (output / (sys.argv[1] + "-attempt.json")).open("x") as stream:
        json.dump({"stage": sys.argv[1], "lockSha256": sha(run / "recovery-v2-lock.json")}, stream)
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
    torch.manual_seed(0)
    if sys.argv[1] == "convert":
        config = AutoConfig.from_pretrained(str(root / lock["modelDirectory"]), local_files_only=True, trust_remote_code=False).vision_config
        config._attn_implementation = "eager"
        vision = SiglipVisionModel(config).eval()
        vision.load_state_dict(load_file(str(run / "vision-fp32.safetensors")), strict=True)

        class Encoder(torch.nn.Module):
            def __init__(self, encoder):
                super().__init__()
                self.encoder = encoder
            def forward(self, pixels):
                return self.encoder(pixel_values=pixels, return_dict=False)[1]

        traced = torch.jit.trace(Encoder(vision).eval(), torch.zeros(1, 3, 224, 224), check_trace=False)
        model = ct.convert(traced, convert_to="mlprogram", minimum_deployment_target=ct.target.iOS17,
            inputs=[ct.TensorType(name="pixel_values", shape=(1, 3, 224, 224), dtype=np.float32)],
            outputs=[ct.TensorType(name="embedding", dtype=np.float32)], compute_precision=ct.precision.FLOAT16, skip_model_load=True)
        model.save(str(output / "vision-fp16.mlpackage"))
        import coremltools.optimize.coreml as cto
        compressed = cto.linear_quantize_weights(model, config=cto.OptimizationConfig(global_config=cto.OpLinearQuantizerConfig(mode="linear_symmetric", dtype="int8", granularity="per_channel", weight_threshold=512)))
        compressed.save(str(output / "vision-int8.mlpackage"))
    elif sys.argv[1] == "evaluate":
        import time
        baseline = json.loads((run / "baseline.json").read_bytes())
        prototypes = np.asarray(json.loads((run / "text-prototypes.json").read_bytes())["vectors"], dtype=np.float64)
        result = {"schemaVersion": "siglip-image-only-coreml-v1", "baseline": baseline, "arms": {}}
        for arm in ["fp16", "int8"]:
            package = output / ("vision-" + arm + ".mlpackage")
            model = ct.models.MLModel(str(package), compute_units=ct.ComputeUnit.CPU_ONLY)
            rows = []
            for row in lock["rows"]:
                start = time.perf_counter()
                observed = {"id": row["id"], "failure": None}
                try:
                    raw = model.predict({"pixel_values": np.load(run / (row["id"] + "-input.npy"), allow_pickle=False)})
                    vector = np.asarray(raw["embedding"], dtype=np.float64).reshape(-1)
                    if vector.shape != (768,) or not np.isfinite(vector).all() or np.linalg.norm(vector) <= 0:
                        raise ValueError("invalid_vector")
                    vector /= np.linalg.norm(vector)
                    scores = prototypes @ vector
                    expected = next(b for b in baseline if b["id"] == row["id"])
                    observed.update(vector=vector.tolist(), scores=scores.tolist(), top1=lock["classes"][int(np.argmax(scores))], embeddingCosine=float(vector @ np.asarray(expected["vector"])), maxScoreError=float(np.max(np.abs(scores - np.asarray(expected["scores"])))))
                except Exception as exc:
                    observed["failure"] = type(exc).__name__
                observed["durationMs"] = round((time.perf_counter() - start) * 1000)
                rows.append(observed)
                with (output / (arm + "-" + row["id"] + ".json")).open("x") as stream:
                    json.dump(observed, stream, allow_nan=False)
            result["arms"][arm] = {"rows": rows, "resourcesBytes": sum(p.stat().st_size for p in package.rglob("*") if p.is_file()) + (run / "text-prototypes.json").stat().st_size}
            del model
        with (output / "results.json").open("x") as stream:
            json.dump(result, stream, allow_nan=False, indent=2)
    else:
        raise ValueError("unknown_stage")


if __name__ == "__main__":
    main()
