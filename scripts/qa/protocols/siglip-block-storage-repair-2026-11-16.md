# Selective block32 storage repair — registered November16

The FP32-compute/per-channel INT8 repair FAILED synthetic cosine0.8963/0.9356;
its photo budget was NOT dispatched. All earlier results preserved.
Installed coremltools9 documents smaller groups reducing shared-scale scope and
per_block requiring iOS18. This is an isolated deployment experiment, not an
application minimum-OS change. Public app remains untouched.

One new fixed candidate: FP32 compute, iOS18, signed symmetric INT8 block32 for
the72encoder linear-weight matrices ONLY. Preserve patch embedding, positional
embedding, pooling head, all biases and normalizations in FP32. No data fitting,
calibration, model/prompt/reference change or threshold optimization. This choice
comes from architecture and storage-error isolation, not photo-score tuning.
The old per-channel attempt quantized all sufficiently large constants.

Budget: one synthetic-zero trace; same zero/ramp probes, two eager reference and
two CoreML candidate forwards. Freeze converted package hash before prediction.
Require both synthetic normalized-vector cosine>=0.995 or stop with0photo calls.
If successful, exactly four cached real-image inputs, once, against unchanged
FP32 baseline. Keep ORIGINAL INT8 gates:4/4successful,4/4same top1,cosine>=0.995,
max15class-score absolute error<=0.005, package+prototypes<=150MiB. No weakened
gate, new data, resampling, independent accuracy, native phone or release claim.
All intermediate failures remain documented; refuse repeats; OS network denied.

Implementation source reference (accessed November16): installed coremltools9
OpLinearQuantizerConfig documents per_block/block_size and OptimizationConfig
per-constant overrides; _quantization_passes requires iOS18 for per_block.
[Apple quantization overview](https://apple.github.io/coremltools/docs-guides/source/opt-quantization-overview.html)
explains grouping/weight compression. No weight training or paid provider.
