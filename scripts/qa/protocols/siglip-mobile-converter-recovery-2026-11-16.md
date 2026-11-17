# Converter-only compatibility recovery, registered before converted predictions

First registered export produced the four FP32 reference rows and image-only
weights, then failed inside CoreMLTools9 casting a one-element constant under
NumPy2.5.5 (`TypeError: only0-dimensional arrays can be converted to Python
scalars`). Preserve original lock, attempt, stdout/stderr/process result and
all reference files unchanged. No converted-model image predictions occurred.

Isolated recovery uses NumPy2.3.5 in a separate private folder, not a patch to
third-party source or the old environment. Reload only the saved image encoder
with strict state-dict keys, same source config/eager attention. No text or real
image reference recomputation. One additional synthetic-zero trace (two total
across both conversion attempts) is explicitly recorded; this is a software
compatibility repair, not a new real-image quality attempt or threshold search.

Conversion-only outputs are saved to recovery/; original conversion outputs never
overwritten. Keep originalFP16/INT8tolerances,size≤150MiB,classprompts/fourimages.
At most4convertedpredictions/arm,once. No new model, quantization policy, prompt,
image, expected label or acceptance gate. Freeze recovery code/environment and
source/ref/artifact hashes before conversion, then hash converted packages before
evaluation. Actual OS network denial continues. No phone/Android/quality claim.

Recovery v1 stopped during construction, before any trace or prediction:
Transformers 5.23 exposes SiglipVisionModel directly (no nested vision_model).
Its exact failed source is archived with SHA-256 in failed-recovery-source/.
Recovery v2 corrects only that constructor, freezes the archived evidence too,
and writes exclusively to recovery-v2/. The additional-zero-trace budget and all
image, score, size and ranking gates remain unchanged.
