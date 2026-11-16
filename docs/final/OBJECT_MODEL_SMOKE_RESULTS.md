# Actual cleaned-source model comparison — November 16, 2026

Result: both local models rank the two text-free spoon depictions correctly;
SigLIP2 also ranks both multi-object captions correctly, MobileCLIP oneof2.
This is a four-scene development smoke, NOT release/physical accuracy evidence.
No installed app model/prototypes, barcode scanner or phone changes.

## Registered experiment, not retrospective prompt tuning

Protocol: docs/research/object-model-smoke-protocol-2026-11-16.md.
Private run: work/object-model-smoke-20261116.N66M3L/.
Exactly4clean source images/model,15identical English prompts/classes,1canonical
attempt,0prediction retries,0training or paid inference. Two text-free spoon
positives and two multi-object controls labelled from prior source/visual review.
commons5coffee cup excluded BEFORE predictions due source-credit discrepancy.
No reserve/replacement, prompt/threshold change or extra selected successful view.

Models: original2024AppleMobileCLIP-S0/CoreML, not MobileCLIP2; official
GoogleSigLIP2Base224 revision75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2,Apache2.
MobileCLIP uses new15QAclass prototypes, not the installed18group material policy.
Its image geometry is full-frame aspectfit256/sRGB/gray127; SigLIP uses its
official224PILprocessor. This compares two pipelines, not architecture alone.
No OCR/barcode/text-reading service supplies the spoon label in this experiment.
Text encoders embed the fixed class descriptions, not text read from photos.

## Actual outcomes

| Clean scene | Registered target | MobileCLIP top1 | SigLIP2 top1 |
| --- | --- | --- | --- |
| commons1:two printed mugs/boxes | multiple-cups | multiple-cups | multiple-cups |
| commons2:one wooden spoon depiction | spoon | spoon | spoon |
| commons3:one bent spoon depiction | spoon | spoon | spoon |
| commons4:spoon and fork together | spoon-and-fork | spoon | spoon-and-fork |

Both:2/2positive top1agreements,0process/image failures. Controls:Mobile1/2,
SigLIP2/2. All8observations retained. These are expected-class agreements on tiny
seen source data, not accepted identification precision. No arbitrary score
threshold/unknown calibration, no outside-class test pictures; automatic accepts0.

Mobile's mixed-utensil scores are close:spoon0.274800versus spoon-and-fork0.273626.
Keep the error; do not tune prompt/margin using this case. SigLIP mixed-utensil
scores:spoon-and-fork0.145217versus spoon0.115013. Magnitudes across models are
NOT comparable confidence probabilities. The observed gain is one control image,
not demonstrated superior general recognition, material detection or safer sorting.

## Actual offline execution and limits

- macOS sandbox-exec `(deny network*)` wraps both inference processes. A controlled
  HTTPS probe fails under the same policy. HF offline flags/local_files_only and
  trust_remote_code=false, local safetensors only; no remote model Python executes.
- Fresh Swift6warnings-as-errors binary and original Apple model recompile pass.
  Validate all original asset hashes and freeze48model/compiled/code/data/source
  pins before any text/image prediction. Lock SHA256
  7e54120c34745d98e00c446ee9bfd485a6a381e9a41b2ef8b3f31b59165dee72.
- Mobile15text forward passes and4image forwards; SigLIP15class embeddings in
  one text batch and4image forwards. No training or pipeline callback to providers.
- Mac CPU per-image durations, excluding both model/text-prototype loads:
  Mobile282/30/20/26ms; SigLIP186/132/102/118ms in registered image order.
  No phone latency, energy, cold-start benchmark or Android acceptance follows.
- SigLIP observed Mac peak RSS1,440,759,808bytes. NativeMobileRSS not measured;
  do not compare missing memory measurements. Full SigLIP checkpoint1,500,800,904
  bytes includes both text and image towers; this is NOT an optimized image-only
  mobile size or a recommendation to bundle1.5GB. Image-only export/quantization
  needs its own size, numerical/decision parity and platform tests.
- Reused isolated Python environment:torch2.15.0/transformers5.23.0/Pillow12.0.0/
  safetensors0.8.0. Host/runtime/package stack is trusted, not all environment
  artifacts exhaustively pinned. No project package/dependency version changes.

## Retained preparation failures and warnings

First SigLIP weight transfer times out at300s after840,619,467bytes. Keep log and
partial file. Explicit Range206continuation fetches only remaining bytes; verify
complete1,500,800,904bytes against official LFS SHA256
612923381c76ec5a9bed335d1c48827e3f2e506ac31b044b63b2031fadee6a0b.
All six smaller files were already hash-verified and reused, not reacquired.
This is download recovery, not a second image attempt or relaxed weight check.

Initial default xcrun tool path cannot locate coremlcompiler; explicit installed
Xcode path resolves it. First asset path references an empty old staging folder;
actual assets-validated folder is hash-checked and compiled successfully. Retain
all logs; no inference occurred during these failures. Initial lint flags one
assignment-in-loop expression; fix before freeze and full validation.

Transformers warns that use_fast is deprecated and emits default-config token-ID
validation warnings. A separate config/tokenizer/safetensors-header diagnostic,
with0model predictions, verifies actual vocabulary256000, embedding shape
[256000,768], tested max token235250within range, sequence64/maxpositions64.
No evidence that the default-construction warning invalidated this frozen run;
retain warning, do not silently rerun with changed processor settings. Future
runtime upgrade uses a new explicitly registered parity experiment.

## Independent verification and next decision

`review` rehashes48pins, binds every raw stdout observation/image hash, checks
complete denominators, and independently recounts rank leaders directly from raw
scores using a separate counting path. No new model calls. Actual attempted repeat
is refused at the exclusive attempt.json marker BEFORE dispatch; observations/
summary hashes remain unchanged. Results SHA256:

- observations.json:8d5e4812d6bd46ba6c0141bcd072489d2ddd8bc132a68b0f2cf6e3d86acc135b
- summary.json:4875ee0d6be12039abdbcd710f3f859e3d1e9f77486020847f539bef0a40a7f3

Read-only reproduction:

```sh
node scripts/qa/object-smoke-run.mjs review work/object-model-smoke-20261116.N66M3L
node --test scripts/__tests__/object-smoke.test.mjs
```

Five new regressions cover missing/duplicate rows, failure denominators, complete/
unique/finite/in-range score vectors, excluded credit-held sample and no automatic
acceptance. Full1887tests(856Node+1031workspace)/checks/builds/18routes pass;
19existinglint warnings remain. TEST_EVIDENCE.md records exact validation logs.

Decision: keep installed model unchanged. The result demonstrates a feasible
local text-free spoon-form path with new class descriptions, not a finished app
feature. SigLIP merits an image-only deployment feasibility/parity experiment,
not immediate promotion. Larger diverse known/unknown/sibling and physical
iPhone/Samsung datasets, calibration, material evidence and versioned sorting
rules remain necessary. Pretraining membership unknown; no independent reviewer
or manufacturer truth is fabricated. Public release remains NO-GO.
