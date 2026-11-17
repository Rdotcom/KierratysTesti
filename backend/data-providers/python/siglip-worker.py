"""One bounded stdin JPEG, local CPU model, one score JSON. No network or photo files."""
import hashlib
import io
import json
from pathlib import Path
import sys
import warnings

MODEL_HASH = "d90cf29df7a26cd39d5c8d03c0b6c13179f03e8e905659111be3cbf54552984b"
PROTOTYPE_HASH = "eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21"
CLASSES = ["cup","spoon","fork","knife","bottle","jar","can","carton","bag","battery","phone","textile","multiple-cups","spoon-and-fork","other"]

def main():
    import numpy as np
    import onnxruntime as ort
    from PIL import Image, ImageOps
    import PIL
    if (np.__version__, ort.__version__, PIL.__version__) != ("2.5.5", "1.32.0", "13.0.0"):
        raise ValueError("runtime_versions")
    directory = Path(sys.argv[1]).resolve(strict=True)
    for name, expected in [("vision-int8.onnx",MODEL_HASH),("prototypes.json",PROTOTYPE_HASH)]:
        file = directory / name
        if file.is_symlink() or not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
            raise ValueError("model_integrity")
    encoded = sys.stdin.buffer.read(1_500_001)
    if len(encoded) > 1_500_000 or len(encoded) < 12:
        raise ValueError("image_bound")
    Image.MAX_IMAGE_PIXELS = 8_000_000
    warnings.simplefilter("error", Image.DecompressionBombWarning)
    with Image.open(io.BytesIO(encoded)) as source:
        if source.format != "JPEG" or source.width * source.height > 8_000_000 or getattr(source,"n_frames",1) != 1:
            raise ValueError("jpeg_only")
        image = ImageOps.exif_transpose(source).convert("RGB")
        pixels = np.asarray(image.resize((224,224),Image.Resampling.BILINEAR))
    tensor = ((pixels.astype(np.float64)/255).astype(np.float32)-np.float32(.5))/np.float32(.5)
    tensor = np.transpose(tensor,(2,0,1))[None].copy()
    prototype = json.loads((directory/"prototypes.json").read_bytes())
    vectors = np.asarray(prototype["vectors"],dtype=np.float64)
    if prototype["classes"] != CLASSES or vectors.shape != (15,768) or not np.isfinite(vectors).all():
        raise ValueError("prototype_shape")
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    options.log_severity_level = 4
    session = ort.InferenceSession(str(directory/"vision-int8.onnx"),options,providers=["CPUExecutionProvider"])
    value = session.run(["embedding"],{"pixel_values":tensor})[0].astype(np.float64).reshape(-1)
    norm = np.linalg.norm(value)
    if value.shape != (768,) or not np.isfinite(value).all() or not np.isfinite(norm) or norm <= 0:
        raise ValueError("embedding")
    scores = vectors @ (value/norm)
    if not np.isfinite(scores).all() or np.max(np.abs(scores)) > 1:
        raise ValueError("scores")
    print(json.dumps({"scores":[{"kind":k,"similarity":float(v)} for k,v in zip(CLASSES,scores,strict=True)]},allow_nan=False),flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Never expose input bytes, decoded text, image paths or parser exceptions.
        sys.exit(2)
