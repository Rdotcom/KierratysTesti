# SigLIP2 native consumer and physical iPhone parity — November16,2026

## Result and scope

The isolated Swift consumer passes actual **iPhone12ProMax/iOS27.2(24B115)**
parity on all four frozen development scenes. It decodes/resamples each real
image file on the phone, produces byte-identical input tensors, then executes
the pinned768D block32 CoreML encoder using CPU_ONLY. All4top1classes are
preserved,0inference failures. Maximum class-score difference from compressed
Mac output is3.33e-16; from the original uncompressed baseline0.00064997.

This verifies this four-scene native path on this one physical iPhone, NOT
arbitrary products, live camera/JPEG capture, unknown rejection, material/sorting
truth, Samsung, airplane mode, battery, peak memory or release readiness.
The test uses the same already-seen four public/licensed PNGs, not a new holdout.
The credit-held fifth image remains excluded.

**The normal app camera route has NOT switched to SigLIP2.** An isolated temporary
native host exercised the same new Swift source; KeepItGreen0.1.0(11), its data,
MobileCLIP512D consumer, barcode/OCR/catalogue/rules and signing remain unchanged.
After retaining all results, only the newly created test host and its generated
on-device test data were removed. Its signed build/results remain recoverable
on the Mac. Exact helper inventory becomes empty; KeepItGreen is restored to
foreground and its later samePID query succeeds. No real-app data container read,
uninstall, reset, renewal, paid API or GitHub push.

## Native implementation

- SiglipImagePreprocessor: bounded RGB input, explicit EXIF1–8 transformation,
  separable antialiased bilinear resize with Pillow12-compatible22bit rounding,
 224square/NCHW, Double rescale followed by Float32 normalization(mean/std0.5).
  No MobileCLIP padding/center crop.23actual native assertions cover orientation,
  channel order, constant images and invalid dimensions/lengths.
- SiglipImageEncoder: single JPEG/PNG,<=8MB/4096dimension/8Mpixels, malformed/
  animated/transparent rejection, sRGB decode, exact Float32[1,3,224,224]model
  input/[1,768]output checks, CPU_ONLY, finite unit-normalized embedding. It
  returns no winner, product/material/bin verification or network result.
- Existing Expo bridge and MobileCLIP predictor do not call the candidate.
  No large SigLIP asset enters the shipping resource bundle. The original model/
  prototype/four-notice pins remain; add only the exact new MIT-CMU resampler
  licence pin, keeping strict file enumeration and legacy30MB budget.
- The candidate is iOS18-gated; the application16.4deployment minimum is NOT
  raised. Compatible preprocessing source and licence notices are tracked;
  compiled models, images, signing metadata and device identifiers stay private.

Mac native preprocessing matches all four original saved NPY tensor payloads
**byte-for-byte/maxabs0** before phone model dispatch. Device tensor SHA values
match those native tensors exactly. Source/model/image/signed-artifact hashes
are frozen before installation/dispatch; the temporary host validates its model
files/image bytes before prediction. Source hashes bind the actual compiled
adapter to the measured artifact.

## Actual physical measurements

| Scene | Top1 (same as original) | Original-vector cosine | Max original-score error | Image wall ms | Sampled RSS bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| commons-1-clean | multiple-cups | 0.99982950 | 0.00064997 | 134.90 | 560,840,704 |
| commons-2-clean | spoon | 0.99994622 | 0.00030781 | 86.46 | 568,328,192 |
| commons-3-clean | spoon | 0.99993897 | 0.00042561 | 67.84 | 570,179,584 |
| commons-4-clean | spoon-and-fork | 0.99991344 | 0.00046324 | 88.60 | 577,454,080 |

All satisfy original unchanged INT8 cosine>=0.995/score-error<=0.005/same4top1
gates. Candidate resource size remains125,467,999bytes including prototypes;
physical runtime stores compressed weights but computes FP32, not INT8 math.
Model loading measured900.57ms, after resource-hash verification. Per-image wall
time includes file read/hash, decode, resize, tensor hash and prediction, not
model loading, camera capture, React Native/IPC/UI or source-model download.

RSS is a sampled whole-test-process reading, **not a peak or memory bound**.
Approximately561–577MB is materially larger than the125MBstored resource: do
not confuse storage compression with runtime RAM. Normal-app simultaneous model
loading, memory pressure, cancellation, backgrounding and energy remain untested.
Next integration must use lazy/serial loading and release resources; these timing
samples do not certify the existing photo-worker deadline or a low-memory tier.

## Retained failures and limits

Initial helper built/signed/installed, but iOS27abort signature
UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption occurs before
worker dispatch. Its Documents inventory is empty and the code writes an
exclusive started marker BEFORE loading/calling the model:0model predictions.
A diagnostic relaunch also produces no marker. Crash, signed binary and exact
four source snapshots are retained; no quality attempt was discarded.

Repair follows Apple TN3187: explicit scene manifest, UIWindowSceneDelegate,
scene-connected window/worker startup. New run/source/signed locks, same adapter,
model/data/prompts/gates and4prediction budget. The repaired host performs exactly
4deviceimage predictions, no fitting/calibration/extra model calls. Actual
relaunch subsequently refuses at exclusive started marker; raw results SHA stays
unchanged. Repeat refusal is not an additional inference failure.

Preparation failures also retained: initial JS staging parse typo; public-profile
whole-plist JSON conversion (data/date fields) repaired with targeted public
TeamIdentifier extraction; collection required creating a local destination
directory. None dispatched a model or accessed a private key. First full test
run rejects the newly added licence as an unexpected resource: fixed by adding
its one exact SHA, never by broadening enumeration or changing old resource pins.

Build-script device ID is now a validated invocation argument, not committed
personal data. Exact historical build/review source is archived by SHA; a
read-only historical mapping verifies the old signed lock without re-pinning.
Independent historical audit verifies274pin entries across both runs/locks,
crash/zero-dispatch evidence, vector joins, repeat stability, helper removal and
unchanged exact product inventory. Device identifiers/profiles/crash files are
not committed.

## Validation and receipts

- Xcode27beta/iPhoneOS27 Release native host BUILD SUCCEEDED, automatic free
  developer signing and strict signature verification pass. Actual install,
  launch, result transfer and independent native-vector/class recount pass.
-23Swift preprocessing assertions;14newNode regressions (9device parity,
 5native/lifecycle/privacy policies) pass. All legacy native model tests pass.
- `pnpm validate:mobile` and full `pnpm validate` pass: **1920tests =889Node+
 1031workspace**, all boundaries/format/lint/types/builds/18web routes,19existing
  lint warnings. These builds are not a new full signed KeepItGreen build.
- No network client exists in adapter/test host; only bundled test images used.
  This is not an OS network-denial or physical-airplane-mode test.

Success run: work/siglip-native-v2-20261116.fkWS2e/.
Initial failure: work/siglip-native-20261116.QmRNh5/.
Read-only recount, no model calls:

```sh
node scripts/qa/siglip-native-artifact.mjs review work/siglip-native-v2-20261116.fkWS2e
```

| Receipt | SHA-256 |
| --- | --- |
| Native source/input lock | d8f01487961071eb0f23e97be241260e581f77a235bca495ab7e2e83967dd206 |
| Signed artifact/source lock | 38c132341352b2577423e774c2efc3dc7d2288cd5096dac916c146e3a4212395 |
| Actual phone results (also unchanged after relaunch) | f412e6c85944bb3be095b5d8c6235862006ae67632b11a38cbbd3d933799f8c8 |
| Independent device recount | 429bc737acbd8d9511c85e42c78fcb11ce0795bbed0368e52673c4ccd216cbe4 |
| Historical/source/cleanup audit | 644f2b2c096a39712be6d16aa5b2b07770318482c40918ada0e1b62fda421fdd |
| Native device build log | eb00b1d9b05fd2a3936f344561c3b9999ba1dbbb855c92f47a77fe8d7a3e8b4d |

Validation log hashes are in TEST_EVIDENCE.md. Protocol:
docs/research/siglip-native-device-protocol-2026-11-16.md.
Primary sources accessedNovember16:
[Apple scene lifecycle migration](https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle),
[Pillow12 resampling](https://github.com/python-pillow/Pillow/blob/12.0.0/src/libImaging/Resample.c),
[Pillow licence](https://github.com/python-pillow/Pillow/blob/12.0.0/LICENSE).
Public release remains NO-GO; four development scenes are not general reliability.
