# SigLIP2 native consumer/device parity — registered November16

Parent802e778, candidate block-lock d2ace54bc4e2681184210793a2b11ce9424b8491b326e2305c175b704590a859.
Owner requests isolated native adapter and actual connected-phone parity.
No existing app/model/scanner replacement or paid/network recognition is needed.

## Native input contract

Swift decoder accepts one bounded JPEG/PNG,<=8MB,<=4096perdimension/8Mpixels;
reject malformed/animated/transparent inputs. Explicit EXIF1–8 orientation, sRGB
8-bit RGB, antialiased bilinear with22bit coefficient convention,224square,
NCHW, Double rescale thenFloat32 normalization(mean/std0.5). No center crop or
MobileCLIP padding. Validate Float32[1,3,224,224]input and[1,768]output,finite/
unit vector, CPU_ONLY to match parent. No product/material/rule verification.

Pillow12 primary source consulted before implementation, November16:
https://github.com/python-pillow/Pillow/blob/12.0.0/src/libImaging/Resample.c
https://github.com/python-pillow/Pillow/blob/12.0.0/LICENSE
Compatible Swift coefficient/rounding implementation retains MIT-CMU attribution
in packaged Notices. Native23orientation/bounds/channel tests initially pass.
Actual4Mac decoder/resampler outputs exactly match cached original NPY tensors,
maxabs0, before any new model inference. These preparation checks are not device
or camera evidence. Freeze source/compiler/binary/tensors before dispatch.

## Fixed device experiment

Same4cleanwebscenes/15cachedprompts, no held-credit fifth image, no new data,
training, calibration, threshold tuning or unknown/general accuracy claims.
One temporary native test host with a separate technical bundle ID; install it
with existing free developer signing, never replace/reset KeepItGreen or its data.
Include only test sources, pinned compiled model, source notices and these4
public/licensed images. No camera/gallery, personal-photo acquisition, account
secret, API key, paid provider, analytics or network client.

Exclusive on-device started marker refuses repeated model execution. Exactly4
native image predictions, CPU_ONLY, once. Each performs actual decode/preprocess
and768Dnative encode; verify tensor SHA exactly matches Mac native tensor, all4
top1 unchanged, normalized-vector cosine>=0.995 and max15class-score error<=0.005
against ORIGINAL FP32 baseline. Also report differences from compressed Mac
output, not substitute it for original baseline. Preserve failures/denominator.
Time model load separately; per-image wallclock includes decode+preprocess+
predict. Record sampled process RSS (not peak memory or battery acceptance).

Freeze signed artifact/source/model/input lock before installation/launch and
verify hashes independently after copying only QA results from test-host container.
Recover results even if gates fail; do not repeat predictions to improve a score.
Build/provision/connection repairs before first dispatch are not recognition
retries. No claim of live camera, airplane mode, Samsung or general quality.
Keep installed client11 unaffected; return it to foreground after testing.
Temporary host may be removed after all exact results are safely retained.

Public NO-GO and previous failed candidates remain. Device success on4seen
development scenes would verify only this adapter/model path on this one iPhone.

## Host lifecycle repair before first model dispatch

Initial helper built/signed/installed, but iOS27.2 aborts in
UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption before test worker
dispatch. Its Documents directory has0files/no started marker; crash receipt and
exact4source snapshots/hashes retained under original run/failed-host-source/.
A diagnostic relaunch also exits without a marker. No reference/prediction rows
exist and no quality rerun is authorized by this startup failure.

V2 adds explicit UIApplicationSceneManifest/UIWindowSceneDelegate configuration
and moves window/worker startup to scene connection, following
[Apple TN3187](https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle)
(accessed2026-11-16). New isolated run/staging/locks/artifact, same4images/model/
adapter/preprocessor/scores/gates/one4prediction budget. Keep the failed native
artifact and crash. Repair collection destination setup and public-profile
TeamIdentifier extraction; neither is model/quality evidence. Add only exact new
Pillow licence pin to existing resource allowlist; retain every original pin and
30MB legacy-resource budget. Never broaden/disable legacy integrity checking.
