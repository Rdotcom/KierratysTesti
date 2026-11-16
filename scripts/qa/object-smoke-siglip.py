"""CPU-only, local safetensors smoke. No training, network, or remote code."""
import hashlib
import json
from pathlib import Path
import resource
import signal
import sys
import time


def main():
    root = Path(__file__).resolve().parents[2]
    run = Path(sys.argv[1]).resolve(strict=True)
    if not run.is_relative_to(root / "work"):
        raise ValueError("outside_work")
    lock = json.loads((run / "lock.json").read_bytes())
    for file, digest in lock["pins"].items():
        actual = root / file
        if actual.resolve(strict=True) != actual:
            raise ValueError("linked_file")
        check = hashlib.sha256()
        with actual.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                check.update(chunk)
        if check.hexdigest() != digest:
            raise ValueError("input_drift")
    import torch
    from PIL import Image
    from transformers import AutoProcessor, SiglipModel

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.manual_seed(0)
    torch.use_deterministic_algorithms(True)
    Image.MAX_IMAGE_PIXELS = 8_000_000
    model_path = str(root / lock["modelDirectory"])
    processor = AutoProcessor.from_pretrained(model_path, local_files_only=True, trust_remote_code=False, use_fast=False)
    model = SiglipModel.from_pretrained(model_path, local_files_only=True, trust_remote_code=False,
        use_safetensors=True, attn_implementation="eager").to(device="cpu", dtype=torch.float32).eval()
    texts = processor(text=lock["prompts"], padding="max_length", truncation=True, max_length=64, return_tensors="pt")

    def vector(value):
        if not isinstance(value, torch.Tensor):
            value = value.pooler_output
        if not torch.isfinite(value).all():
            raise ValueError("nonfinite_embedding")
        return torch.nn.functional.normalize(value, p=2, dim=-1)

    with torch.inference_mode():
        text_vectors = vector(model.get_text_features(**texts))

    def timeout(_signal, _frame):
        raise TimeoutError("image_deadline")
    signal.signal(signal.SIGALRM, timeout)
    for row in lock["rows"]:
        start = time.perf_counter()
        result = {"model": "siglip2", "id": row["id"], "imageSha256": row["imageSha256"], "failure": None}
        signal.setitimer(signal.ITIMER_REAL, 60)
        try:
            with Image.open(root / row["file"]) as source:
                if source.width * source.height > 8_000_000:
                    raise ValueError("image_bound")
                pixels = processor(images=source.convert("RGB"), return_tensors="pt")
            with torch.inference_mode():
                image_vector = vector(model.get_image_features(**pixels))
                similarities = (image_vector @ text_vectors.T)[0].tolist()
            result["scores"] = [{"group": group, "cosine": value} for group, value in zip(lock["classes"], similarities, strict=True)]
        except Exception:
            result["failure"] = "image_inference_failed"
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
        result["durationMs"] = round((time.perf_counter() - start) * 1000)
        result["processPeakRssBytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        print(json.dumps(result, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
