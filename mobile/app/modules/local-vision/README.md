# Local Apple Vision observations

Local Expo module `KierratysLocalVision`, iOS only. Original material entry points:
`inspectReadiness()` and `recognize(jpegBase64: string)`.
The application adapter validates their untrusted results before use. Readiness
reports full, primary-only or unavailable support; full means resource integrity
and interface availability, **not recognition accuracy**. Older clients without
that entry report readiness unreported rather than claiming a model is absent.
Clients without the module, Android and web report local recognition unavailable;
never silently fall back to a paid/network provider. Linking requires a native build.

## Optional SigLIP2 object suggestions (client12)

`recognizeObjectCandidates(jpegBase64, requestID, timeoutMs)` and matching-ID
`cancelObjectCandidates(requestID)` add an optional iOS18+ path. The camera
coordinator first preserves existing barcode/catalogue/text-confirmation evidence;
only unknown/unavailable catalogue results receive object-form suggestions.
These are up to three **unverified, uncalibrated** labels from fifteen fixed text
prototypes, not a product database, verified material or automatic sorting answer.
The guide/material confirmation remains separate. No cloud fallback or service key.

The pinned image-only block32 CoreML resources are in a separate optional
`KierratysSiglipCandidates.bundle`, staged by
`node scripts/qa/stage-siglip-camera-assets.mjs`. This development recipe currently
requires the private, hash-verified export artifacts named by that script. A clean
checkout does not contain the large model: it builds without this optional bundle
and reports suggestions unavailable. Reproducible public acquisition/export and
Android support remain unfinished; do not promise feature parity on Samsung.

The same serial native gate covers both models. Release the MobileCLIP cache
before lazy SigLIP load; release SigLIP in the worker autoreleasepool after each
request. The native12s watchdog retains the gate until actual work settles, even
after timeout/cancel. Matching cancellation has bounded pre-dispatch tombstones.
The coordinator allows15s work total with up to1s JS cancellation-delivery grace;
neither watchdog forcibly interrupts a synchronous CoreML prediction. Background/
leave/cancel suppresses results and clears application photo/suggestion state.

Client12 is installed and one owner-operated spoon camera case returned
“Lusikka · Haarukka · Veitsi”. Four controlled worker JPEGs preserve the original
top1/0.005 score gate; an additional strict Mac comparison fails for one JPEG.
Decode-only testing finds different OS input tensors for exactly that JPEG, not
proof of complete causality. See `docs/final/SIGLIP_CAMERA_INTEGRATION.md` for
retained failures, resource/latency evidence and outstanding full-app RAM/quality
limits. This is not general accuracy or public-release approval.

This uses Apple's existing pretrained Vision model and a bundled, pinned 2024
MobileCLIP-S0 image supplement, **not an own-trained model**. The supplement runs
only after a successful primary no-match, never to override a match or conflict.
Our separate application mapper treats these results as unverified observations.
No label authorizes material selection, verified product identity or a sorting
answer. The app must retain user material/condition confirmation and rule sources.

## Execution and data boundary

- The caller prepares the JPEG with the shared photo-image codec/metadata remover.
  Native code independently requires canonical base64, at most2,000,000 encoded
  characters/1,500,000 decoded bytes, a single JPEG and4096-axis/16MP pixel bounds.
- No native URL/path input, request, temporary image file, model download,
  application logging, analytics or persistent result/history is implemented.
- The module privacy manifest declares no tracking/collected data and reason
  35F9.1 for `ProcessInfo.systemUptime`: measuring elapsed time inside this
  user-initiated inference and enabling its deadline. Raw boot/uptime values are
  never returned or used for fingerprinting. Only elapsed milliseconds are
  returned. The podspec bundles the manifest; verify the built bundle separately.
- A process-wide gate rejects concurrent requests as busy. A serial user-initiated
  queue handles pixels/Vision, not the main/JS thread.12s best-effort cancellation
  discards late results; busy remains until actual native work settles. JS must
  independently ignore results after cancellation/leave/background.
- Classifier revision2 on iOS17+/macOS14+, else revision1. OCR revision3,
  accurate recognition, explicit `material-code-lexicon-v1` OCR policy: en-US,
  language correction enabled, automatic language detection disabled, fixed
  13-abbreviation dictionary (PET/HDPE/PVC/LDPE/PP/PS/PAP/FE/ALU/FOR/COT/TEX/GL).
  The actual supported language is recorded in `ocrLanguages`; unavailable en-US
  fails closed, never silently changes policy. Apple's dictionary mechanism
  requires language correction. It can still misread text, so output is only a
  candidate for independent confirmation, not material truth or Finnish OCR.
- Output is bounded: the complete seven exact primary classification identifiers with
  finite scores and Apple per-class precision/recall operating-point flags,
  24 distinct OCR lines of at most64 UTF-16 code units, no controls/format chars,
  fixed engine/schema/revisions, OS version, timestamp and elapsed milliseconds.
  A separate supplement reports skipped/unavailable or eighteen ordered finite
  cosine scores with pinned model/prototype/prompt/preprocessing provenance.
  Cosines are not probabilities; primary scores are model confidence, **not
  calibrated packaging-accuracy percentages**.
- Current observation schema is `local-vision-v4`; strict V2/V3 compatibility is
  retained by the application adapter, without inventing supplement metadata.
  Readiness uses `local-vision-readiness-v1`.
  `apple-class-operating-point-v1` fixes minimum
  precision0.9/minimum recall0.01. A flag requires an available precision/recall
  curve and `hasMinimumRecall(0.01, forPrecision: 0.9)`. These are Apple's internal
  class operating points, not a measured90% precision guarantee for this app.
  Scores from different labels are never compared. Generic parent/scene labels
  do not veto children; more than one accepted object kind remains ambiguous.
- Fixed error codes: ERR_LOCAL_VISION_BUSY, ERR_LOCAL_VISION_INVALID_IMAGE,
  ERR_LOCAL_VISION_UNAVAILABLE, ERR_LOCAL_VISION_FAILED, ERR_LOCAL_VISION_TIMEOUT.
  The outer once-only watchdog includes queue/decode/request/prediction time;
  uncancellable work retains the busy gate until settlement. No underlying exception,
  image, OCR content or device path is exposed in an error.

The exact same engine source is compiled by `scripts/qa/local-vision/main.swift`
for controlled macOS baseline testing. Mac output is not physical-iPhone evidence.
The CLI can read one explicitly selected, licence/hash-cleared local fixture;
that file-reading code is not in the native app engine.

The pinned supplement's full four component/weight notices are in
`ios/Resources/Notices/` and bundled by the podspec. See
`docs/final/LOCAL_CLASSIFIER_UPGRADE.md` at the repository root
for acquisition/licensing/evaluation scope. Rejected learned heads and QA-only
exporters are not shipped; current known quality failures remain release gates.

## References (accessed2026-11-03)

- [VNClassifyImageRequest](https://developer.apple.com/documentation/vision/vnclassifyimagerequest)
- [VNRecognizeTextRequest](https://developer.apple.com/documentation/vision/vnrecognizetextrequest)
- [Custom OCR vocabulary and language-correction requirement](https://developer.apple.com/documentation/vision/vnrecognizetextrequest/customwords) (rechecked2026-11-06)
- [VNObservation confidence](https://developer.apple.com/documentation/vision/vnobservation/confidence)
- [Apple multi-label taxonomy and class-specific filtering,10:42–19:52](https://developer.apple.com/videos/play/wwdc2019/222/)
- [Expo local modules](https://docs.expo.dev/modules/get-started/)
- [Apple required-reason system uptime API](https://developer.apple.com/documentation/foundation/processinfo/systemuptime)

The installed Xcode26.6/macOS26.5 SDK headers additionally document classifier
revision2 (same1,303-identifier taxonomy, iOS17+/macOS14+). Algorithm revision is
recorded, not an immutable publicly downloadable model-weight hash; OS updates
and hardware can still change behavior. Evaluate after relevant changes.
