# Registered web-source object model smoke v1

Registered before any text/image prediction in this experiment, November16.
Owner explicitly requests comparison on the cleaned development pictures.
Baseline21b958d, private run work/object-model-smoke-20261116.N66M3L/.

Compare original2024MobileCLIP-S0 Core ML versus official Google SigLIP2 Base224,
revision75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2, Apache2, local safetensors.
Model card accessed16November: https://huggingface.co/google/siglip2-base-patch16-224.
Current MobileCLIP2 research-only weights are NOT substituted. Existing original
ASCL notices/assets/tokenizer remain as previously pinned. No training/paid API.

## Frozen data and metrics

Use only `commons-1-clean` through `commons-4-clean` from clean-v4 manifest
SHA256fddc61ba656959f57368dd80317680351f9e1950dc0f5e8108abcda65c65d2ab.
All originals/derivatives/source licences from prior acquisition retained.
Actual visual labels established before predictions:

- commons1: two printed mugs on boxes; multi-object control → multiple-cups.
- commons2: text-free wooden-spoon depiction → spoon-form positive.
- commons3: text-free bent-spoon depiction → spoon-form stress positive.
- commons4: spoon+fork depiction → spoon-and-fork multi-object control.
- commons5: excluded BEFORE predictions due source-credit discrepancy. No call.

Exactly four image attempts/model, two models, no retries/reserves/rotation/OCR/
prompt selection against outcomes. Missing/failed/timeout rows remain failures.
Canonical attempt marker is created exclusively before dispatch; repeat refused.
All15English class prompts and order live in scripts/qa/object-smoke-protocol.mjs,
one prompt/class shared between models; no labels from filenames at inference.
Class set: cup/spoon/fork/knife/bottle/jar/can/carton/bag/battery/phone/textile/
multiple-cups/spoon-and-fork/other. No fallback classifier, guessed material or bin.

Use L2 normalized image/text embeddings and cosine rank. Report all15scores,
top3, positives top1 outof2 and control-specific top1 outof2 separately. Scores
are not probabilities; argmax is not automatic acceptance. No calibrated unknown
threshold can be fitted on four images. Automatic accepts0 by design, NOT100%
precision. No pass/fail99%/coverage/SKU/device/release claim from this experiment.

Model-specific frozen preprocessing: MobileCLIP full-frame aspectfit256/sRGB/
gray127padding; SigLIP2 official224processor recipe, config pinned. Different
preprocessing is part of the compared pipelines, not an isolated architecture
effect. New QA prompt classes are not the installed app's original prototypes.

## Execution and integrity

Download preparation uses only official pinned-revision HF files; verify Git blob
or LFS SHA256, declared sizes and1.55GB ceiling. Preserve metadata/card/licence;
no repository Python, pickle or trust_remote_code. Existing isolated PyTorch/
Transformers environment reused, no package installation or app dependency changes.
Apple sources recompiled into this private run and all compiled/model/data/code
hashes frozen into lock.json before model predictions. SigLIP file is1.50GB,
not a mobile bundle size recommendation. Host/runtime trusted assumptions remain.

Run both under macOS sandbox-exec deny-network policy with offline HF settings.
Verify a network probe fails under that same policy. CPU only. Mobile text15
forward passes, SigLIP15text embeddings in one batch; four image forwards each.
Parent timeout180s MobileCLIP/240s SigLIP, Python per-image60s. No retries after
partial results. Every stdout/stderr/exit row retained; failures filled explicitly
for missing rows, never counted correct. Record image durations excluding model
load and Mac process RSS where available, not phone latency/battery measurements.

Independent result checker recomputes ranks/denominators, authenticates result/
source/data joins and preserves all attempts without making new model calls.
Unit tests cover missing/duplicate rows, invalid/nonfinite scores and failure
denominators. Then full pnpm validate. No push or phone replacement authorized.

## Interpretation and stop condition

This is four previously reviewed, source-labelled web scenes, only two positive
spoon forms, no general cup/other-object/unknown coverage. Pretraining membership
unknown. No independent physical captures, Finnish market, material or native
Android parity. Even4/4cannot promote either model. Use the result only to identify
specific next failures/data needs; do not adjust prompts/thresholds or rerun the
same images until a preferred result appears. Existing failed SKU gates unchanged.
