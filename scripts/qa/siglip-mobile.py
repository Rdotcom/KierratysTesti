"""Registered local image-only conversion experiment; no app or network calls."""
import hashlib
import json
from pathlib import Path
import resource
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


def main():
    root = Path(__file__).resolve().parents[2]
    run = (root / sys.argv[2]).resolve(strict=True)
    if not run.is_relative_to(root / "work"):
        raise ValueError("outside_work")
    lock = json.loads((run / "lock.json").read_bytes())
    for relative, expected in lock["pins"].items():
        file = root / relative
        if file.resolve(strict=True) != file or sha(file) != expected:
            raise ValueError("input_drift")
    write(run / (sys.argv[1] + "-attempt.json"), {"lockSha256": sha(run / "lock.json"), "stage": sys.argv[1]})
    sys.path.insert(0, str(run / "conversion-deps"))
    import numpy as np
    import torch
    from PIL import Image
    from transformers import AutoProcessor, SiglipModel
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.manual_seed(0)
    torch.use_deterministic_algorithms(True)
    torch.backends.mha.set_fastpath_enabled(False)
    Image.MAX_IMAGE_PIXELS = 8_000_000
    if sys.argv[1] == "export":
        model = SiglipModel.from_pretrained(str(root / lock["modelDirectory"]), local_files_only=True,
            trust_remote_code=False, use_safetensors=True, attn_implementation="eager").eval()
        processor = AutoProcessor.from_pretrained(str(root / lock["modelDirectory"]), local_files_only=True,
            trust_remote_code=False, use_fast=False)
        def tensor(value):
            return value if isinstance(value, torch.Tensor) else value.pooler_output
        def unit(value):
            return torch.nn.functional.normalize(value, dim=-1)
        with torch.inference_mode():
            text = unit(tensor(model.get_text_features(**processor(text=lock["prompts"], padding="max_length", truncation=True, max_length=64, return_tensors="pt"))))
        write(run / "text-prototypes.json", {"classes": lock["classes"], "vectors": text.tolist()})
        observations = []
        for row in lock["rows"]:
            item = {"id": row["id"], "failure": None}
            try:
                with Image.open(root / row["file"]) as image:
                    pixels = processor(images=image.convert("RGB"), return_tensors="pt")["pixel_values"]
                with torch.inference_mode():
                    embedding = unit(tensor(model.get_image_features(pixel_values=pixels)))
                    scores = (embedding @ text.T)[0].tolist()
                np.save(run / (row["id"] + "-input.npy"), pixels.numpy(), allow_pickle=False)
                item.update(vector=embedding[0].tolist(), scores=scores, top1=lock["classes"][int(np.argmax(scores))],
                    parentScoreMaxError=max(abs(a - b) for a, b in zip(scores, row["parentScores"], strict=True)))
            except Exception as exc:
                item["failure"] = type(exc).__name__
            observations.append(item)
            write(run / (row["id"] + "-reference.json"), item)
        write(run / "baseline.json", observations)
        if any(r["failure"] or r["parentScoreMaxError"] > 0.00001 for r in observations):
            raise ValueError("baseline_parity_failed")
        vision = model.vision_model
        del model
        from safetensors.torch import save_file
        save_file(vision.state_dict(), str(run / "vision-fp32.safetensors"))

        class Encoder(torch.nn.Module):
            def __init__(self, encoder):
                super().__init__()
                self.encoder = encoder
            def forward(self, pixels):
                return self.encoder(pixel_values=pixels, return_dict=False)[1]

        wrapper = Encoder(vision).eval()
        with torch.no_grad():
            traced = torch.jit.trace(wrapper, torch.zeros(1, 3, 224, 224), check_trace=False)
        import coremltools as ct
        converted = ct.convert(traced, convert_to="mlprogram", minimum_deployment_target=ct.target.iOS17,
            inputs=[ct.TensorType(name="pixel_values", shape=(1, 3, 224, 224), dtype=np.float32)],
            outputs=[ct.TensorType(name="embedding", dtype=np.float32)],
            compute_precision=ct.precision.FLOAT16, skip_model_load=True)
        converted.save(str(run / "vision-fp16.mlpackage"))
        import coremltools.optimize.coreml as cto
        config = cto.OptimizationConfig(global_config=cto.OpLinearQuantizerConfig(mode="linear_symmetric", dtype="int8", granularity="per_channel", weight_threshold=512))
        compressed = cto.linear_quantize_weights(converted, config=config)
        compressed.save(str(run / "vision-int8.mlpackage"))
        write(run / "export-complete.json", {"modelFiles": {p.name: sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) if p.is_dir() else p.stat().st_size for p in [run / "vision-fp32.safetensors", run / "vision-fp16.mlpackage", run / "vision-int8.mlpackage"]}, "peakRssBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss})
    elif sys.argv[1] == "evaluate":
        import coremltools as ct
        prototypes = json.loads((run / "text-prototypes.json").read_bytes())
        text = np.asarray(prototypes["vectors"], dtype=np.float64)
        baseline = json.loads((run / "baseline.json").read_bytes())
        result = {"schemaVersion": "siglip-image-only-coreml-v1", "baseline": baseline, "arms": {}}
        for arm in ["fp16", "int8"]:
            package = run / ("vision-" + arm + ".mlpackage")
            model = ct.models.MLModel(str(package), compute_units=ct.ComputeUnit.CPU_ONLY)
            rows = []
            for row in lock["rows"]:
                start = time.perf_counter()
                observed = {"id": row["id"], "failure": None}
                try:
                    values = model.predict({"pixel_values": np.load(run / (row["id"] + "-input.npy"), allow_pickle=False)})
                    vector = np.asarray(values["embedding"], dtype=np.float64).reshape(-1)
                    if vector.shape != (768,) or not np.isfinite(vector).all() or np.linalg.norm(vector) <= 0:
                        raise ValueError("invalid_vector")
                    vector /= np.linalg.norm(vector)
                    scores = text @ vector
                    expected = next(b for b in baseline if b["id"] == row["id"])
                    observed.update(vector=vector.tolist(), scores=scores.tolist(), top1=lock["classes"][int(np.argmax(scores))],
                        embeddingCosine=float(vector @ np.asarray(expected["vector"])),
                        maxScoreError=float(np.max(np.abs(scores - np.asarray(expected["scores"])))))
                except Exception as exc:
                    observed["failure"] = type(exc).__name__
                observed["durationMs"] = round((time.perf_counter() - start) * 1000)
                rows.append(observed)
                write(run / (arm + "-" + row["id"] + ".json"), observed)
            result["arms"][arm] = {"rows": rows, "resourcesBytes": sum(p.stat().st_size for p in package.rglob("*") if p.is_file()) + (run / "text-prototypes.json").stat().st_size}
            del model
        write(run / "results.json", result)
    else:
        raise ValueError("stage")


if __name__ == "__main__":
    main()
