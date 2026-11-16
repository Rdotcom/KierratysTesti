# JPEG parity repair and actual-app memory protocol — November16

Owner requests repairing the remaining score discrepancy and measuring memory on
the connected phone. Baseline eeb8d5a/client12. Preserve all earlier failed gates,
model/prototype/legacy resource pins and original error≤0.005/strictMac≤1e-5.
No paid inference, new LAN server, secret use, push or public release.

First isolate JPEG decoding without predictions: exactly the existing four JPEGs,
default versus explicitly CPU-preferred ImageIO decoding. Apple's November16
documentation of CIImageOption.useHardwareAcceleration describes JPEG/HEIF CPU
preference and the corresponding ImageIO key. No claim that this makes output
deterministic until actual Mac/phone tensor bytes agree. PrioritizeQuality is
RAW-only and is not a JPEG fix. Keep the existing resize/normalization/model.
If system CPU preference does not resolve parity, do not ship an undocumented
workaround or lower gates; evaluate a pinned deterministic decoder separately.

Register any replacement decoding policy and exact inputs/sources before a new
model run. One new four-image worker pass per platform after actual source repair;
compare full15scores/rank against unchanged original and platform gates. This is
a new implementation regression test, not retrying the old experiment for a
better outcome or evidence of broader recognition quality. Retain every failure.

Actual-app memory: Instruments currently reports the available CoreDevice phone
offline. Try the supported debugger/device path before new instrumentation.
Measure the real application process, distinguishing footprint/RSS/sample maximum
from true peak/allocations. If instrumentation is needed it must be QA-only,
record numeric metrics/phases only, no image/OCR/user text/location, and be absent
from the final installed normal build. Record baseline, inference and settling,
repeat bounded controlled work to check retained growth and cancellation. Do not
substitute test-host RSS for whole-app memory or claim battery/stress approval.
Preserve main app data and signed rollback; remove only our temporary helper.

Sources accessed2026-11-16:
- https://developer.apple.com/documentation/coreimage/ciimageoption/usehardwareacceleration
- https://developer.apple.com/documentation/imageio/kcgimagesourceprioritizequality
- https://developer.apple.com/videos/play/wwdc2022/10106/ (footprint versus RSS)
- https://developer.apple.com/documentation/xcode/gathering-information-about-memory-use

The briefly acquired stb_image2.32 source is not integrated: its own current
security note recommends a safer decoder for untrusted inputs. CPU preference
does not resolve the difference, so do not ship that raw option as a fix.

Replacement registered before predictions: official libjpeg-turbo3.2.1 commit
7b4993786d856cbccabfc0ed2f923ba000e326cc, codeload archive SHA256
e10ff4ce2943a9021f9b0398fe00029915dd4eaf32c7560e36305341ec826735.
Accurate integer IDCT/smooth chroma upsampling, SIMD disabled for both ARM64
targets;8-bit RGB/YCbCr/gray only. Reject CMYK/non-sRGB profiles, malformed/warning,
oversize/precision/dimension conflicts. Bound intermediate buffers32MB,8MP,
4096axes,100progressive scans; no file I/O in adapter. Unchanged EXIF orientation,
Swift resize/normalization/model/prototypes. New explicit preprocessing identity
siglip2-jpeg-turbo3.2.1-islow-nosimd-srgb-aa22-224-nchw-v2. Raw C decoder requires
sanitizer/malformed/bounds tests before app deployment; no claim of formal safety.
Notices IJG+BSD must ship; this software is based in part on the work of the
Independent JPEG Group. No model calls until four pinned JPEG tensors agree on
Mac/phone; then exactly4newworker calls/platform, unchanged original/strict gates.
Upstream sources accessed2026-11-16:
- https://github.com/libjpeg-turbo/libjpeg-turbo/releases/tag/3.2.1
- https://github.com/libjpeg-turbo/libjpeg-turbo/blob/7b4993786d856cbccabfc0ed2f923ba000e326cc/src/turbojpeg.h
- https://github.com/libjpeg-turbo/libjpeg-turbo/blob/7b4993786d856cbccabfc0ed2f923ba000e326cc/LICENSE.md
