# SigLIP conversion precision diagnostic — preregistered November16

The original frozen export FAILED: FP16 and INT8 each preserve only3/4top1.
Never replace or relabel these results. No new photo inference in this diagnostic.
Use saved strict image weights/config and the same cached reference vectors.

Determine whether error originates in tracing or reduced compute precision:
two synthetic tensors only (all-zero and deterministic linspace[-1,1],1x3x224x224).
One new zero trace, then two eager and two traced forwards. Convert that trace to
FP32 and a single mixed-precision candidate: only linear/conv operations in FP16,
all attention, normalization, residual and nonlinear operations remain FP32.
Predict each synthetic input once with old FP16, diagnostic FP32 and mixed model.
Report normalized-vector cosine and maxabs error, no class/accuracy claims.
No fitting/calibration/photo/prompt changes; no numerical gate relaxation.

If tracing/FP32 fail, diagnose before any new photo evaluation. If mixed passes
synthetic cosine>=0.999, freeze it and exactly one symmetric INT8 weight-compressed
variant (same512threshold/per-channel policy; no new compression search). Only
then register four-photo evaluation of both against the unchanged original
FP16/INT8 parity and150MiB gates. This is explicitly a new engineering repair on
seen development images, never an independent holdout or a replacement first run.

Freeze source and inherited inputs before synthetic calls. Deny OS networking;
exclusive outputs refuse retries. Preserve all previous locks, raw failures and
sources. No app/device/scanner or Android changes.

Primary source accessed November16:
[Apple typed execution](https://apple.github.io/coremltools/docs-guides/source/typed-execution.html)
documents numerical differences with FP16 and explicit FP32 MLProgram compute.
Installed coremltools9 source exposes FP16ComputePrecision(op_selector), verified
locally; public generated API reference currently describes8.1, not9.0.
