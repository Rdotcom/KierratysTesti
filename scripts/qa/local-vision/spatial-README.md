# Fixed spatial disagreement experiment

QA only. Read `scripts/qa/protocols/local-vision-spatial-protocol.md` before any picture
prediction. This is development on the already-seen original validation16 and,
only after a locked qualifying choice, a separately frozen prospective20. No
old held-out result is read or reused by this tool. No app behavior, model,
prototype, prompt, score threshold, material/safety/bin rule or licence changes.

## Spatial CLI

`spatial-main.swift` uses the same pinned2024 image encoder/prototypes and CPU
inference. JPEG base64 stdin only, never a path/title/reference. EXIF orientation
then origin normalization precede four fixed crops: left/right60% width at full
height, bottom/top60% height at full width;20% overlap in each opposing pair.
Each crop is independently centered/aspect-fit to256² sRGB on RGB127/127/127.
Raw output names the actual different preprocessing, normalized/pixel crop rect,
oriented size, four18-score vectors and completed/attempted prediction counts.
The counters report actual calls returning, not correct recognition. Failures
retain partial counters and are never successful abstentions or four successes.

```sh
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc \
  -swift-version 6 -parse-as-library -module-cache-path work/FRESH/module-cache \
  scripts/qa/local-vision/spatial-main.swift -o work/FRESH/spatial-qa
work/FRESH/spatial-qa --self-test
work/FRESH/spatial-qa --preflight \
  work/PINNED/compiled/mobileclip_s0_image.mlmodelc work/PINNED/prototypes.json
```

Compilation,25 geometry/bounds/malformed-input selfchecks and preflight have zero
model predictions. Actual `--score-spatial` uses the same two asset arguments;
one process loads once, then makes four sequential predictions for one cleared
image. No cache-intermediate retention, no cryptographic wipe promise. This is
not native-phone latency/memory/battery evidence.

## Explicit development

Use the exact approved binaries and original captured baseline receipt pinned
in the evaluator, not a retake. Each of16 old validation cases gets one spatial
execution (64 planned region predictions); primary/center are reused unchanged.
S1 rejects any supported-kind regional disagreement. S2 additionally requires
the original accepted kind among those regional kinds. Neither substitutes a
kind or repairs an already-unknown/conflicting/failed baseline. Required crop
failure becomes unknown/spatial_unavailable and an operational failure; it is
not a successful error removal. Unknown-baseline extra observations are recorded
but not newly required for that case.

```sh
node --import ./node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/loader.mjs \
  scripts/qa/local-vision/spatial-evaluate.mjs --run --phase development \
  --spatial work/FRESH/spatial-qa \
  --compiled work/PINNED/compiled/mobileclip_s0_image.mlmodelc \
  --prototypes work/PINNED/prototypes.json \
  --corpus work/OLD/final-reviewed --manifest-sha LOCKED_OLD_MANIFEST_SHA256 \
  --baseline work/OLD_VALIDATION/summary.json --baseline-sha LOCKED_BASELINE_SHA256 \
  --output work/FRESH/development
```

Selection requires at least one error removed, no newly wrong or correct lost,
at least five correct positive estimates and no introduced required operational/
schema failure. Prefer most removed errors, then most correct, then S2. These
are **seen-development metrics**, not another fresh held-out pass.

The pinned existing tsx loader is required for the shared contracts' extensionless
TypeScript imports. Native Node stripping alone is not a supported evaluator
entry. No package installation or runtime version change is performed here.

## Prospective confirmation

Use `--phase confirmatory`, the new spatial-data corpus/manifest and exact frozen
`--selection`/`--selection-sha` from development, plus pinned `--primary` and
`--center`. Do not supply a baseline receipt: each new case runs primary/center
once, then spatial once **only if baseline accepts**. The one locked S variant
is evaluated; null/failed development cannot start fresh model calls. A change
to algorithm/model/prototype/protocol source between phases stops the run;
phase-specific data references are separately frozen before their own first call.

All attempts/raw failures/counters/post-hashes are retained with no overwrite or
retry. Case references and provenance stay outside model stdin/args. Primary/OCR
observations remain distinct from required object-guard failure. Prospective
integration requires zero wrong/newwrong/correctloss/introduced failure, at least
five positive correct estimates, and a wrong removed if baseline makes any.
Finite AI-reviewed public-image evidence does not establish general reliability,
human label acceptance, real-camera performance or public-production GO.
