# Frozen local recognition reliability comparison

QA only. Read `scripts/qa/protocols/local-vision-robustness-protocol.md` before execution.
No app classifier is changed by these tools; two veto-only algorithms compare
against the decomposed current V4 baseline. No training, paid service, user-photo
reuse, material/SKU/safety/bin inference or physical-device acceptance is implied.
The original MobileCLIP2024 licence and pinned image/prototype/prompts are unchanged.

## Second-view tool

The original frozen `mobileclip-main.swift` executable supplies center-square
scores. The separate fit tool keeps the full EXIF-oriented frame, aspect-fits it
into a centered256² sRGB RGB127/127/127 canvas and emits all18 raw cosines with
the honest `aspect-fit-256-srgb-gray127-v1` preprocessing identifier. It does not
average scores, select a class or decide whether a picture is packaging.

```sh
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc \
  -swift-version 6 -parse-as-library -module-cache-path work/FRESH/module-cache \
  scripts/qa/local-vision/mobileclip-robustness-main.swift \
  -o work/FRESH/mobileclip-fit-qa
work/FRESH/mobileclip-fit-qa --self-test
work/FRESH/mobileclip-fit-qa --preflight \
  work/PINNED/compiled/mobileclip_s0_image.mlmodelc work/PINNED/prototypes.json
```

These checks perform zero model predictions. Actual `--score-fit` takes the
same two model/prototype arguments and exactly one cleared canonical JPEG as
base64 stdin, never a picture path/title/reference label. Only explicit parent
approval after data/tool freeze may start real picture calls.

## Explicit evaluator

Use the exact reviewed binaries pinned in `robustness-evaluate.mjs`; no automatic
download/recompile or alternate checkpoint is accepted. All local files must be
regular, nonlinked files under ignored `work/`. The fresh output's parent must
already exist under that root. The corpus validator checks all32 images, group
separation, reference/rights/privacy/freshness metadata and exact bytes before
the first case. Mandatory full validation includes the pure Node policy tests.

```sh
node --import ./node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/loader.mjs \
  scripts/qa/local-vision/robustness-evaluate.mjs --run \
  --primary work/PINNED/primary-v3 --center work/PINNED/mobileclip-qa \
  --fit work/FRESH/mobileclip-fit-qa \
  --compiled work/PINNED/compiled/mobileclip_s0_image.mlmodelc \
  --prototypes work/PINNED/prototypes.json --corpus work/DATA/final-reviewed \
  --manifest-sha EXACT_REVIEWED_SHA256 --phase validation \
  --output work/FRESH/validation
```

Validation executes primary/center/fit once per case (48 attempts), retaining
every attempt/raw exit/error/wall time, case decision, source/input hash and
failure. No retry or replacement. It selects A/B only under the frozen error,
coverage and operational constraints; an always-unknown or unchanged agreement
cannot earn deployment when baseline has no erroneous acceptance.

The existing pinned `tsx` loader resolves the project's extensionless TypeScript
contract imports. Native Node type stripping alone does not; test the import
before picture calls. No package installation is required. The frozen data
manifest's `inferenceExecuted:false` describes acquisition/freeze time, not the
later comparison receipts in the run directory.
Validation and held-out each require at least five correct accepted positives
out of ten, in addition to no more than one baseline-correct loss.

Held-out requires `--phase heldout`, the exact validation `--selection` summary,
and separately frozen `--selection-sha SHA256`, plus a new output directory.
Every artifact/source/protocol/manifest hash must still equal validation; time,
phase and recomputed selection are checked. Only the locked candidate runs: fit
is omitted unless B won; null selection audits baseline only. Held-out cannot
choose a candidate. Source hash drift stops the run and retains attempts.

Call counts are process attempts, not proof that every attempt reached model
prediction. Expected operational failures remain unknown, in the denominator,
and never count as successful error removal/safe abstention. Invalid/extra-key/
unknown/crashed output remains invalid. Six controls per split are tiny
engineering evidence, never general reliability or production certification.

`operationalFailures`/introduced failures in algorithm metrics refer to that
algorithm's required **object-decision stages**, not the whole native observation.
The raw per-model `modelStages` separately reports primary observations/failures,
center observations/failures and fit observations/failures. A supplemental model
failure does not erase a successful primary/OCR observation; an unused fit
failure cannot disqualify A. Primary conflict is valid uncertainty, not failure.
