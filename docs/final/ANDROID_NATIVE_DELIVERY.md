# Android native delivery — November17, 2026

Scope: owner's requested Android implementation, available-device testing,
iPhone update and one reviewed KierratysAppi/main source publication. Not store
publication or universal recognition approval. No physical Samsung is available.
Final install/publication status is in CURRENT_STATE.md and TEST_EVIDENCE.md;
do not infer it from this procedure or an earlier APK's existence.

## Actual implementation

Android has its own Kotlin adapter: bundled ML Kit Latin text/barcode reading
and ONNX Runtime CPU SigLIP2 object-form suggestions. No photo upload, service
key, paid inference or first-run model download. The separate barcode scanner
continues to use Expo Camera; explicit product lookup uses the existing bundled
catalogue/cache/network fallback, not the image model. Unknown uncached products
still need internet. A brand or barcode identity is not proof of material.

Original iOS Apple Vision/MobileCLIP/CoreML/pinned-JPEG paths are preserved.
Android does not fabricate Apple's class operating points or exact-SKU visual
matches. Its output is independently bounded/validated, unverified/uncalibrated,
with a separate model/preprocessing identity. User confirms object/material and
applicable jurisdiction before the existing source-backed sorting answer.

Google's pretrained model is not an own-trained universal recognizer. Our work
includes export/weight-only quantization, JPEG/EXIF/AA22 preprocessing, strict
native adapters, serialized deadlines/cancellation, evidence normalization and
the decision/UI/rule integration. Fifteen object-form prototypes are not all
Finnish products, and four development images are not a quality benchmark.

Model95,661,204bytes, SHA256
`d90cf29df7a26cd39d5c8d03c0b6c13179f03e8e905659111be3cbf54552984b`;
original prototype hash unchanged. Apache2 and Pillow notices ship in APK.
The APK is larger than the model because it also contains React Native/SDK
native libraries and the existing app assets. No test images ship in production.

## Measured Android native parity, airplane mode

API35/AOSP ARM64 emulator, configured3072MiBRAM, airplane mode1/Wi-Fi disabled.
Actual JPEG bytes→Android decoder→native preprocessing→CPU ONNX inference;
compare all fifteen scores against the original frozen PyTorch JPEG reference:

| Development scene | Top1 | Maximum absolute score difference | Whole request |
| --- | --- | --- | --- |
| commons1 | multiple-cups |0.0018329817|5184ms|
| commons2 | spoon |0.0018729592|3039ms|
| commons3 | spoon |0.0017077188|1138ms|
| commons4 | spoon-and-fork |0.0038615619|2047ms|

All original top1labels and the unchanged0.005gate pass. Bundled OCR reads the
generated PAP21marking; barcode decoder reads generated valid6408430030309.
JUnit completes successfully in13.857s. This is not Samsung timing, general
accuracy, physical optics, thermal/energy/low-memory or real-world robustness.

Retained failures: dynamic activation INT8 conversion violated the score gate
and was rejected; metadata-stripped JPEG EXIF0 was rejected until explicitly
normalized to normal orientation; an early timed native run failed. Removed
millions of temporary coordinate-pair allocations from resizing, keeping pixel
math unchanged. Final optimized native test passes without extending12sdeadline.

## Full-app integration failure caught separately

Android6normal standalone release assembled/signed/installed. Actual UI confirms
offline Oivariini manual lookup, denied-camera manual recovery/permission grant,
live virtual camera, English selection surviving force-stop/relaunch and sourced
English remote-control→WEEE answer. No Metro connection or network is needed.

However, its local-photo Open camera action fails: Expo58Android native constants
omit platform.android.versionCode. Existing general capture guard deliberately
rejects that missing field, despite actual native-module registration. Corrected
only the local flow to require the actual installed native module and bare/
standalone runtime; never trust the mutable JS manifest, allow Expo Go or enable
the separate cloud path. Regression preserves iOS build guard and unavailable
native behavior. Android7/iPhone21are the repaired final-source builds; their
remaining device/UI outcomes must be recorded explicitly in TEST_EVIDENCE.md.

Final7retains no empty OCR-attribution card without detected codes. First photo
permission pause is also repaired with bounded active-resume/abort handling;
actual permission→camera→capture→local uncertain result succeeds. Final repeat
has one immediate automated shutter miss requiring retry, retained as open
medium/local readiness/soak work. Final21is normally rebuilt, installed and
launched; compiler-reordered metadata is frozen back to the exact verified model
without changing graph/weights or the fourteen-resource byte-pin gate. Detailed failed/
successful receipts are in TEST_EVIDENCE.md; do not call every capture verified.

## Privacy and build boundaries

OCR exports only allowlisted bounded material markings and numeric code
candidates; arbitrary OCR/photos/location never become logs/history/analytics.
Serial worker keeps ownership until native work settles, even after timeout;
model/tensor/session close per request. Only a hash-verified public model cache
file is persisted; photo capture cleanup and background/leave cancellation remain.

ML Kit may transmit technical device/app/usage/performance data to Google;
Android-specific Legal text discloses this and links the official SDK policy.
On-device images/text processing does not imply zero SDK telemetry. Google
retention/Data Safety/production privacy work remains an explicit release gate.
No new paid call or credential. Source/model/toolchain references:
docs/research/android-local-vision-2026-11-17.md.

JDK21/SDK37/build-tools37/NDK27.1, minSDK26. Current QA APK is arm64-v8a only,
targetSDK36, local development/test signature, not a Play signing key.16KiB
  ZIP and all30native ELF LOAD alignments, APK signature, source model/prototype/licence pins and absence of
test fixtures/unneeded microphone/storage/background-location permissions are
verified by scripts/qa/verify-android-assessment.mjs. Other ABIs/API levels and
physical Samsung behavior remain unverified. Original iOS asset reproduction
and previous MEM-01/recognition/store findings are not closed by this port.

## Exact future Samsung acceptance — Roope/tester

1. Obtain a64bit Samsung running Android8/API26or newer; record model/OS locally.
   Install the verified test APK by USB/ADB or owner-approved file transfer.
   No paid service/API key needed. Do not publish this local test signature.
2. Start with no camera/location permission. Check denial/manual-code recovery,
   grant camera while using the app, test a real known barcode in daylight and
   low light. The native fixture decoder is not this physical-camera evidence.
3. Enter airplane mode with Wi-Fi off. Manually look up6408430030309. Photograph
   a spoon/cup/ambiguous scene; check object choices, material confirmation,
   unknown/retry/retake/back/background and source-backed guidance. Verify an
   unbundled uncached code honestly reports unavailable rather than guessing.
4. Switch to English, navigate/relaunch, then explicitly return to Finnish.
   Test system large text/TalkBack/reduced motion, silent/vibrate/normal sound,
   repeated captures/low-memory/temperature and battery impact.
5. Re-enable network and location only by user action. Test coarse/denied GPS,
   supported/unsupported/boundary municipality confirmation and nearby materials.
   Record pass/failure text and nonpersonal receipts; do not upload user images
   or precise coordinates. Repair local defects before claiming hardware parity.
