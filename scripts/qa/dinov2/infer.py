"""Local safetensors-only DINOv2 experiment. No download or training code."""
import hashlib
import json
import math
from pathlib import Path
import resource
import signal
import sys
import time


def digest(data):
    return hashlib.sha256(data).hexdigest()


def unit(vector):
    if len(vector) != 384 or not all(math.isfinite(x) for x in vector):
        raise ValueError("invalid_descriptor")
    norm = math.sqrt(sum(x * x for x in vector))
    if norm < 1e-12:
        raise ValueError("empty_descriptor")
    return [x / norm for x in vector]


def rank(query, references):
    best = {}
    for reference in references:
        similarity = sum(a * b for a, b in zip(query, reference["vector"], strict=True))
        product = reference["productId"]
        best[product] = max(best.get(product, -2.0), similarity)
    return [{"productId": p, "cosine": s} for p, s in sorted(best.items(), key=lambda x: (-x[1], x[0]))]


def main():
    root = Path(__file__).resolve().parents[3]
    output = Path(sys.argv[1]).resolve(strict=True)
    if not output.is_relative_to(root / "work"):
        raise ValueError("outside_work")
    lock_bytes = (output / "lock.json").read_bytes()
    lock = json.loads(lock_bytes)
    for relative, expected in lock["pins"].items():
        file = root / relative
        if file.resolve(strict=True) != file or not file.is_file() or digest(file.read_bytes()) != expected:
            raise ValueError("pin_mismatch")
    import numpy as np
    import torch
    from PIL import Image, ImageOps
    from transformers import Dinov2Model

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    torch.manual_seed(0)
    Image.MAX_IMAGE_PIXELS = 16_000_000
    load_start = time.perf_counter()
    model = Dinov2Model.from_pretrained(
        str(root / lock["modelDirectory"]), local_files_only=True,
        use_safetensors=True, trust_remote_code=False, attn_implementation="eager",
    ).to(device="cpu", dtype=torch.float32).eval()
    model_load_ms = (time.perf_counter() - load_start) * 1000
    if model.config.hidden_size != 384 or model.config.patch_size != 14:
        raise ValueError("model_configuration")
    mean = np.array([.485, .456, .406], dtype=np.float32)
    std = np.array([.229, .224, .225], dtype=np.float32)

    def timeout(_signal, _frame):
        raise TimeoutError("per_image_deadline")

    signal.signal(signal.SIGALRM, timeout)
    observations = []
    for row in lock["rows"]:
        start = time.perf_counter()
        observed = {"id": row["id"], "imageSha256": row["imageSha256"], "vector": None, "failure": None}
        signal.setitimer(signal.ITIMER_REAL, 60)
        try:
            file = root / row["file"]
            if file.stat().st_size > 8_000_000 or digest(file.read_bytes()) != row["imageSha256"]:
                raise ValueError("image_identity")
            with Image.open(file) as source:
                if source.width * source.height > 16_000_000:
                    raise ValueError("pixel_budget")
                image = ImageOps.exif_transpose(source).convert("RGB")
                w, h = image.size
                if min(w, h) < 1:
                    raise ValueError("empty_image")
                size = (256, int(h * 256 / w)) if w <= h else (int(w * 256 / h), 256)
                image = image.resize(size, Image.Resampling.BICUBIC)
                left, top = (size[0] - 224) // 2, (size[1] - 224) // 2
                pixels = np.asarray(image.crop((left, top, left + 224, top + 224)), dtype=np.float32)
            normalized = ((pixels / np.float32(255.0)) - mean) / std
            tensor = torch.from_numpy(normalized.transpose(2, 0, 1).copy()).unsqueeze(0)
            with torch.inference_mode():
                descriptor = model(pixel_values=tensor).last_hidden_state[0, 0].tolist()
            observed["vector"] = unit(descriptor)
        except Exception as error:
            # Persist a bounded category, not image data or arbitrary native error text.
            observed["failure"] = type(error).__name__
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
        observed["durationMs"] = (time.perf_counter() - start) * 1000
        observed["maximumProcessRssBytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        with (output / f'{row["id"]}.json').open("x") as destination:
            json.dump(observed, destination, allow_nan=False)
        observations.append(observed)
        print(json.dumps({"completed": len(observations), "id": row["id"], "failure": observed["failure"]}), flush=True)
    references = [{**row, "vector": item["vector"]} for row, item in zip(lock["rows"], observations, strict=True)
                  if row["allocationRole"] == "reference" and item["vector"] is not None]
    rankings = [{"id": row["id"], "rank": rank(item["vector"], references)
                 if item["vector"] is not None and len(references) == 10 else []}
                for row, item in zip(lock["rows"], observations, strict=True) if row["allocationRole"] != "reference"]
    with (output / "raw.json").open("x") as destination:
        json.dump({"lockSha256": digest(lock_bytes), "modelLoadMs": model_load_ms,
                   "device": "cpu", "dtype": "float32", "dimensions": 384,
                   "torch": torch.__version__, "observations": observations,
                   "rankings": rankings}, destination, allow_nan=False)


if __name__ == "__main__":
    main()
