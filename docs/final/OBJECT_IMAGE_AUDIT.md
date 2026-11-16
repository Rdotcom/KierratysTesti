# Object image bytes and origin audit — November 16, 2026

Status: byte-audit tools implemented and exercised on real development images;
new object-model comparison NOT executed. Production remains NO-GO.

## Actual run

Private local run directory: `work/object-image-audit-20261116.BZ3XLX/`.
`audit.json` binds 93 original development images and their source evidence,
11,946,960 image bytes, all 93 successfully decoded. Original source loader
authenticates its historical manifests/metadata joins before the new audit.
New per-row receipts bind original image hash, source-evidence hash, dimensions,
canonical pixel hash and 64-bit difference hash. No original is edited/copied.

All 93 contain embedded metadata according to the conservative ImageIO check.
This includes innocuous orientation/TIFF/XMP information: it is NOT a finding
that all contain personal information. Values/locations are never printed.
One pair is flagged for near-duplicate review; a perceptual flag is not a proven
duplicate and must not automatically remove an inconvenient test example.
Zero physical-pilot images were supplied or inferred from these source pictures.

Actual visual inspection of `case-011` and `case-018` shows near-identical
Nutella400g packshot composition, white background and label layout. This supports
a shared-image/near-duplicate risk, not proven independent captures. Keep both
historical rows/results intact, group them conservatively in any new development
allocation and do not claim a new independent test image from either. Their
original byte/pixel hashes differ; no unsupported exact-original identity claim.

## Decoder incident retained, not silently repaired

The first command using the historical pinned Sharp decoder exits1 before any
image decoding. Its existing pin check finds changed bytes in two cached native
artifacts: Sharp0.35.5.node and libvips8.18.7.dylib. Cause is unestablished; do not
claim compromise, code signing or package update without further evidence.
Historical trust anchors and all historical recognition results remain untouched.

Use an explicitly selected separate macOS ImageIO/CoreGraphics decoder instead,
not an implicit fallback inside the old loader. Swift6 warnings-as-errors build
passes. The new source, compiled executable SHA and OS identity are recorded.
It accepts only single-image JPEG/PNG, at most8MB/8million pixels/4096per side,
normalizes orientation and renders sRGB RGBA with the OS. These new canonical
pixel hashes are NOT interchangeable with historical Sharp or model preprocessing.
The OS/framework is a declared trust dependency, not fully hash-pinned by this tool.
Real native malformed/empty/oversized inputs all exit1; actual93images decode.

Build/run reproduction (use a new non-existing output path for any new build):

```sh
swiftc -swift-version 6 -warnings-as-errors scripts/qa/local-vision/object-image-audit.swift -o work/NEW/image-audit
shasum -a 256 work/NEW/image-audit
node scripts/qa/object-recognition-files.mjs --historical work/NEW/image-audit ACTUAL_SHA256
node scripts/qa/object-comparison-preflight.mjs scripts/qa/local-vision/object-recognition-pilot-manifest.json work/object-image-audit-20261116.BZ3XLX/audit.json
```

The first paths/SHA are intentionally procedure parameters, not existing files.
Historical audit returns exit2 because findings need handling, not green quality.
Byte-audit CLI exits1 for invalid setup and2 for findings/incompleteness.

## Security, lineage and scope

- Canonical confined paths, no dot/dot-dot/absolute/URL paths, symlink/intermediate
  aliases or hardlinks; bounded file reads include identity/race checks reused
  from the existing audited local QA utility. No network/model/app imports.
- Batch limits:500images,8MB/image,200MB total; actual image-evidence files max4MB.
  Child decoder timeout10s/image and bounded stdout/stderr; no raw exception leak.
- Parent graph must be complete/acyclic and preserve pool/split/object/family.
  Source/generated roots cannot be relabelled physical; transitive derived roots
  remain tied to their original pool. Source/object split mixing is flagged.
- Exact compressed-byte/canonical-pixel duplicate checks and dHash distance≤4
  review flags. These are batch-local, not a scalable global duplicate proof.
- Evidence hashes prove immutable declared records, not legal rights, material
  truth or capture independence. The historical adapter authenticates existing
  provenance; a generic supplied evidence file still needs semantic review.
- Metadata detection quarantines, never silently strips originals or grants
  privacy acceptance. A future clean development copy must retain original and
  transformation hashes. It does not create an independent physical capture.

## Model comparison handoff

Actual `comparison-preflight.json` exits2. It reports empty physical collection,
unclean source-only image batch, unmatched image/metadata count, missing global
lineage/truth review and missing frozen model/evaluation receipts. Models executed0.
No SigLIP weights downloaded and no new accuracy percentage fabricated.

This preflight is preparation-only: even declared clean batch metadata cannot
authorize a model run until global checks and frozen model contracts exist.
It intentionally never emits comparisonAllowed=true. It is NOT a completed
benchmark runner or release gate. User's requested comparison remains pending.

Next executable local work is a bounded, metadata-clean development-copy import
with original/derived lineage and global audit aggregation. Physical text-free
captures of the new object classes and real device/operator evidence are still
needed for the planned iPhone/Samsung quality comparison; old source labels or
synthetic test fixtures cannot fill those rows. No independent-reviewer gate added.

Automated regressions:19file/lineage +4comparison-preflight tests, plus the
existing22metadata tests. Synthetic decoder stubs test plumbing only. No app,
barcode scanner, native product model, phone installation or GitHub push changed.
