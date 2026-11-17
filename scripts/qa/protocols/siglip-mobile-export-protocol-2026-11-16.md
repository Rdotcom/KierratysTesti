# Registered image-only SigLIP2 mobile export/parity v1

Owner requests lighter phone model and recognition preservation, November16.
Baselinecfe188f; private run work/siglip-mobile-20261116.yV442u/.
Register before new text/image model predictions or conversion. No app/model/
scanner/device/GitHub change or general accuracy claim authorized by this experiment.

## Fixed input and candidate budget

Reuse official SigLIP2Base224 source SHA/revision from the frozen web-object smoke.
Parent lock7e54120c34745d98e00c446ee9bfd485a6a381e9a41b2ef8b3f31b59165dee72;
parent observations8d5e4812d6bd46ba6c0141bcd072489d2ddd8bc132a68b0f2cf6e3d86acc135b.
Same four cleaned development scenes and15English prompts/order; exclude credit-
held fifth image. This is a new conversion/parity experiment, not replacing the
original smoke or retaking it for a better recognition score.

1. Compute fixed15text prototypes once offline and retain them separately.
2. Image-only FP32 PyTorch reference: four registered photos, original processor,
   require scoremaxabs≤0.00001versus saved parent observations; record768D vectors.
3. Trace image encoder on one synthetic zero tensor, fixed1x3x224x224, no trace
   checking replays. No real photo used for fitting, calibration or tracing.
4. Convert MLProgram FP16/iOS17; then post-training symmetric per-channel INT8
   weight compression, no activation quantization or data calibration. At most
   these two converted candidates, no INT4/prompt search or threshold tuning.
5. Four actual CoreML image predictions/candidate on Mac CPU, class scores use
   the same cached text prototypes.12realimage calls total (4reference+4FP16+4INT8),
   plus1synthetic trace call and one15text batch. Failures remain in denominator.

PythonCoreMLTools9.0 installed only into the private run's conversion-deps,
reusing isolated torch environment; no project/old environment package changes.
Pin actual source/data/weights/package metadata before model execution. Freeze
source/compiled artifacts for actual conversion/runtime use; never remote Python,
pickle or trust_remote_code. No network permitted during conversion/predictions.
Exclusive attempt marker refuses repeated experiment execution. A failed converter
is retained, not treated as external account/payment blocker or permission to
retune the same quality experiment until it passes.

## Fixed gates

- FP32reference scores agree with frozen original baseline to≤0.00001; no hidden
  processor/model/prompt substitution.
- FP16: all4successful, unchangedtop1, normalized embedding cosine≥0.999 with
  reference and maximumclass-score absolute error≤0.001.
- INT8: all4successful, unchangedtop1, normalized embedding cosine≥0.995 with
  reference and maximumclass-score absolute error≤0.005.
- INT8model resources + cached prototype file≤150MiB. Report actual FP32image-only,
  FP16 and INT8 byte sizes and full1.50GBcheckpoint separately. Do not include
  the large text tower/tokenizer in the proposed image-only phone resources.
- Reject nonfinite/wrong-shape/zero vectors, changed data/pins, missing/duplicate
  rows or model-load/prediction failures. Never substitute shape-only fake outputs.
- Report exact durations/hostRSS where available, but MacCPU/CoreML results are
  NOT signed iOS/Android camera, memory, ANE, battery or startup acceptance.

The four-source sample cannot establish broad accuracy, unknown rejection or
material/sorting truth. Success means only numerical/rank preservation on these
seen scenes. Public NO-GO and the independent physical/multi-class release
requirements remain. This CoreML experiment does not implement Android inference.

## Primary source checks, accessed November16

- [Apple PyTorch conversion](https://apple.github.io/coremltools/docs-guides/source/convert-pytorch-workflow.html): trace/export followed by CoreML conversion.
- [Apple weight quantization](https://apple.github.io/coremltools/docs-guides/source/opt-quantization-overview.html): weight integer precision and symmetric/per-channel options; accuracy must be tested.
- [Apple palettization](https://apple.github.io/coremltools/docs-guides/source/opt-palettization-overview.html): alternative compression exists but not an extra arm in this fixed experiment.
- [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html): alternative Android/mobile path, not claimed implemented or compared here.
- PyPI coremltools9.0wheel metadata inspected: cp312macOSarm64 wheel SHA256
  7079e8b6ff5a63f0e2c08eeeb8673e4eab8ca231d4b2eae4f7fb005e0d08a8cd.
  The Apple installation guide still describes8.0; do not call that stale page
  current-version proof. Installed package provenance/version recorded separately.
