# Offline implementation choices

The existing architecture is Expo58/ReactNative0.88/TypeScript with a local Expo
Swift module, Apple Vision and pinned original MobileCLIP-S0/Core ML image
weights. Actual camera JPEG capture, metadata removal, file deletion, local
permission/lifecycle gates and material recognition already exist. New code
reuses them. Expo Go cannot supply this custom module; an unsigned custom iOS
Release has been compiled, but not installed or tested on a physical device.

Shared contracts/domain own validated evidence/catalogue and pure lookup/ranking;
mobile owns camera, native ports, immutable bundled data and presentation.
Backend Fastify/provider/PostgreSQL paths remain unchanged and are not imported
or invoked by this new offline path. Existing web product lookup/cloud consent
are separately labelled optional actions, never automatic fallback.

## Source checks for the new implementation decision (accessed2026-11-15)

- [Apple VNDetectBarcodesRequest](https://developer.apple.com/documentation/vision/vndetectbarcodesrequest.md)
  exposes local request results and supported symbologies. Use supported EAN8,
  EAN13(also zero-prefixed UPC-A) and ITF14; QR/UPC-E/GS1-128 are NOT claimed.
  Domain validates length/checksum/canonical equivalence independently.
- [DINOv2 official repository](https://github.com/facebookresearch/dinov2)
  identifies original DINOv2 code/weights as Apache2. Its newer XRay/Cell model
  sections have distinct noncommercial terms; repository name alone is not
  licence evidence. DINOv2-Small remains a separate comparison, not a downloaded,
  converted, mobile-tested or proven more accurate replacement in this unit.
- [Apple MobileCLIP official repository](https://github.com/apple-aiml-research/ml-mobileclip)
  separates model/software/data licences. Reuse only already pinned original2024
  image artifact and notices documented in scripts/qa/local-vision/mobileclip-README.md;
  do not substitute the current2025research-only model licence or newer weights.
- Existing same-day multimodal paper/AppleOCR/OFF research remains applicable:
  docs/research/multimodal-recognition-plan-2026-11-14.md. No repeated OFF metadata
  acquisition or paid inference. The new catalogues use authenticated cached data.

## Deliberate implementation limits

Exact cosine search over ten512-dimensional references is simpler than FAISS
on a phone and supports new records without retraining. Its max-per-SKU rank
is diagnostic, NOT calibrated identity. Actual inference has only2safe
confirmation suggestions and a cold timeout; do not promote it to automatic
SKU acceptance. Full+ROI observations come from one image and count once.

Native OCR selects supported languages from FI/SV/EN: this Mac advertises SV/EN,
not FI. No Finnish OCR/model/camera assertion follows from successful compilation.
Only an iOS image adapter exists. Android/manual catalogue lookup is portable;
Android image inference, gallery selection, temporal tracking, a generic catalogue
import/update/migration system and independent capture data remain explicit work.

Static catalogue corruption/mismatch fails closed; compatible app rollback also
restores its catalogue/model pair. This is not an implemented signed updater.
Source/licence notices remain in assets and UI. Broad commercial release still
requires actual quality, device/platform, privacy/licensing and store evidence.
