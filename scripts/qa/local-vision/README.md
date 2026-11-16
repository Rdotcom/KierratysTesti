# Local Vision diagnostic CLI

The Swift CLI compiles the **same** engine file as the iOS module. It never
contains expected labels/brands. This is not a model-training command, a paid
provider request or a phone-quality benchmark. Use an existing stable Xcode and
a fresh ignored `work/` directory for build outputs and evidence.
Replace the capitalized directory names below with those existing approved
directories; they are documentation placeholders, not directories to overwrite.

```sh
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc \
  -swift-version 6 -D LOCAL_VISION_QA -module-cache-path work/FRESH_ROOT/module-cache \
  mobile/app/modules/local-vision/ios/mobileclip-predictor.swift \
  mobile/app/modules/local-vision/ios/local-vision-engine.swift \
  mobile/app/modules/local-vision/ios/siglip-image-preprocessor.swift \
  mobile/app/modules/local-vision/ios/siglip-image-encoder.swift \
  mobile/app/modules/local-vision/ios/siglip-object-predictor.swift \
  scripts/qa/local-vision/main.swift -o work/FRESH_ROOT/local-vision
work/FRESH_ROOT/local-vision --self-test
work/FRESH_ROOT/local-vision --cascade-self-test
work/FRESH_ROOT/local-vision --readiness-self-test
```

The optional SigLIP object path shares this engine's serial gate. Include its
three source files even when running only the legacy CLI self-tests. Its QA
resource store is explicitly locked/Sendable; Swift6checking stays enabled.
Normal app builds exclude all QA resource overrides. Candidate staging and
camera integration evidence: docs/final/SIGLIP_CAMERA_INTEGRATION.md.

The eight malformed/noncanonical/oversized/non-JPEG self-tests perform no image
inference. Actual image diagnostics require a frozen specification and cleared
local image/licence/ground-truth manifest first. Do not train/test on private
photos or download an arbitrary executable/model to satisfy the command.

V4 keeps the primary seven-class/OCR path and adds an optional bundled image
model only after a genuine primary no-match. Matches and conflicting primary
kinds skip it. Missing/invalid resources preserve the primary/OCR observation
with a typed unavailable supplement; a primary error never invokes a fallback.
The single-flight gate and total12s deadline cover both models. These are not
separate restartable time budgets.

The six cascade self-tests exercise pure grouping without image/model calls.
The eight readiness lifecycle self-tests use a controlled no-model job on the
actual serial worker. They check busy recognition/preflight, a bounded timeout,
retaining the gate until real settlement, late-result suppression and retry.
The controlled hook/duration exists only with `LOCAL_VISION_QA`.

`--readiness` performs **no image inference**, camera permission or networking.
It checks the primary Vision revision/identifier/OCR language interfaces, then
the exact bundled model integrity, load and input/output interface. Pass the
same QA-only `--resources work/VERIFIED/KierratysLocalVisionModels.bundle`
argument to test a verified CLI bundle. Its full/primary-only/unavailable
snapshot is not model accuracy, latency, energy or physical-device evidence.
The same12s deadline bounds delivery; an uncancellable load retains the native
single-flight gate until its actual settlement even after timeout. The app
uses only its signed bundle, never a JS resource path. Missing/invalid resources
produce primary-only; missing primary interfaces produce unavailable.

For a separately specified functional V4 check with a verified local model
bundle, the QA-only CLI configuration is:

```sh
work/FRESH_ROOT/local-vision --resources work/VERIFIED/KierratysLocalVisionModels.bundle --base64-stdin
```

Only validated JPEG base64 is supplied on stdin. The model-resource directory
must be canonical, unlinked and inside the checkout's work tree. Resource paths
are not image paths and are never supplied by JS or environment variables.
`LOCAL_VISION_QA` and `configureQAResources` are absent from shipping app builds;
the app instead uses its signed resource bundle automatically. The general
`evaluate.mjs` command below does not pass this extra QA resource argument: do
not mistake a model-unavailable result from that command for supplemental-model
execution. Functional model verification must explicitly inspect the V4
supplement status, model/prototype hashes and score shape.

From the checkout root, use the installed `tsx` CLI (no automatic installation):

```sh
node_modules/.bin/tsx scripts/qa/local-vision/evaluate.mjs --run \
  --binary work/FRESH_ROOT/local-vision \
  --fixture-dir work/APPROVED_FIXTURES \
  --evidence-dir work/FRESH_ROOT/first-diagnostic
```

Optionally pass `--synthetic-manifest work/OWNED_TEXT_FIXTURES/synthetic-ocr-started.json`
for the separately specified owned text-only JPEGs. Their source is generated
CoreText, not externally licensed product photography. These are OCR/handoff
tests, never real-camera or product/material accuracy evidence.

The fixture directory must have `fixtures.json` with `fixtures: [{id, sha256,
bytes}]`; images are `<id>.jpg`. The synthetic manifest has the same bounded
records under `fixtures`, uses `size` or `bytes` and names `synthetic-<id>.jpg`.
All originals are regular non-symlink files inside the checkout's ignored work
tree. Every byte count/hash is checked **before the first call**. Results use
a fresh, nonexisting directory and exclusive per-case attempt markers. No
hidden retries, filtering of failures or replacing earlier runs.

The evaluator resolves `@kierratysappi/contracts/local-vision` through the
mobile package's declared public exports and invokes its actual normalizer.
It records source/binary/schema/spec/input hashes before/after, raw bounded
responses, every normalized result and per-process elapsed time. File names,
case IDs and expected answers are never passed into the engine; only validated
JPEG base64 bytes reach stdin. No images are written by the app engine.

Use `--base64-stdin` directly only for another explicitly cleared diagnostic.
`--jpeg PATH` is a CLI-only file reader, never an app API. Each evaluation case
starts a fresh CLI process: reported times are **not** controlled warm timings,
physical iPhone latency, memory/battery acceptance or production accuracy.

Never change a gate to make the diagnostic set pass. Version and preserve a
semantic correction separately and evaluate genuinely independent real-camera
and unknown/hazard examples before any reliability claim. The original eight
development images remain known development data even after another version.

`system-family-protocol.json` belongs to the earlier frozen V3 experiment. Its
source-transform tool deliberately fails closed after a native identifier/schema
change; reproduce it from the recorded revision/source snapshots, not by
silently adapting it or rerunning its18 calls against V4 as new held-out evidence.

## Reproduce material-code OCR ablation

`ocr-diagnostic-cases.json` contains39 **already-seen owned synthetic text**
cases, not held-out product/camera evidence. The historical first and adversarial
protocols were separately frozen before their calls; this combined manifest is
for reproduction only, with that distinction in its metadata. It defines fixed
current-multilingual/no-correction, en-US/no-correction and en-US/finite-material-
lexicon/correction arms. No classifier threshold or Unicode rewriting is used.

Compile `ocr-diagnostics.swift` into a fresh ignored `work/` directory with the
same explicit stable Xcode and Swift6 command pattern above. Copy the JSON to
that directory as `protocol.json`, then call the binary with `generate` and the
directory path. This creates new owned JPEGs and refuses existing image targets.
Only an explicit `run` command performs OCR, once per image/arm. Paths, protocol
size, fixture count, language/dictionary settings and image size are bounded to
the checkout's work tree. It never runs in the app or downloads anything.

Before `run`, record the protocol/source/binary/input SHA256 hashes and exclusive
attempt marker; retain every raw line and normalize through the public
`extractLocalMaterialCodeCandidates` export. Expected labels/case IDs are not
given to Vision, only pixels. Do not substitute results for a missing model call
or overwrite a previous run. The main `evaluate.mjs` exact-engine procedure is
still required after integrating a selected arm; an isolated OCR ablation does
not prove the app/native combined pipeline. No inference is part of CI.
