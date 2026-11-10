# Own pixel recognizer — November10,2026

**Original code implemented; narrow engineering gate PASS. Not deployed.**
This is a reference-image candidate recognizer, not a newly trained universal
model, verified product identity or material/sorting inference.

## What is now implemented

Experimental public entry: `@kierratysappi/domain/reference-vision`.

- `shared/domain/src/reference-image-features.ts`: bounded copied RGB pixels,
  own bilinear normalization, Harris response/integral arithmetic, spatially
  suppressed corners at two scales and256 own-generated rotated binary tests.
  At most128 points, eight uint32 words each. Reject invalid/low-detail images.
- `shared/domain/src/reference-image-matcher.ts`: mutual distinctive Hamming
  correspondences, fixed256-hypothesis affine consensus, spatial-coverage and
  minimum-inlier checks. Distinct qualifying product IDs remain ambiguous;
  repeated references for one ID are not separate product votes. Result includes
  inferred/uncalibrated status, algorithm versions, reference hash and geometric
  evidence, never an invented name/GTIN/material/bin/probability.
- Separate opt-in export; ordinary domain entry/mobile/backend do not import
  it. No default catalogue, user enrollment, image persistence, runtime decoder,
  UI/camera permission, native module or signed-phone update is introduced.
  The codec in the explicit QA runner is existing sharp, **not a pretrained
  feature extractor**. Core algorithm needs neither sharp nor any ML library.

This is our implementation of established classical concepts credited in the
[frozen protocol](OWN_PIXEL_RECOGNITION_PROTOCOL.md), not a claim that we invented
corner detection, BRIEF or affine geometry. It needs reference pictures; it does
not know arbitrary unseen products. IDs/names/rights need an independently
reviewed catalogue, and pixel similarity cannot establish composition or safety.

## One frozen image experiment

Protocol, gallery, gates, data/runtime/source pins were frozen before real pixel
extraction. Reused exactly32 already-seen rights/privacy-reviewed public images;
no new download, user photo, API call, learned weights or training. These are
reference photograph IDs, not verified SKUs/human identity ground truth.

| Lane | Observed | Result | Meaning |
| --- | --- | --- | --- |
| Gallery originals |5 |5 correct self-retrievals |Duplicate sanity only |
| Fixed gallery transforms |20 |18 correct,2 unknown |Synthetic robustness, not independent captures |
| Other source originals |27 |26 unknown,1 low-detail |No wrong reference candidate in this set |

Zero wrong candidates, ambiguity, invalid outputs or operational failures.
All52 exact planned `(id,variant,known)` keys and per-query receipts exist;
no failed/missing case is discarded. Gallery size stays5.

Misses: `jar-screw/inset` has23 keypoints and `cup-hanoi/inset`39; both produce
`unknown/no_geometric_match`. They are not decode failures. Nonqualifying
correspondence breakdown was not retained, so do not invent a finer causal
diagnosis or retake them. `control-bowl-simple/original` rejects before matching
as low-detail/insufficient corners. Therefore actual counters are32 decodes,
52 feature extractions and**51** matcher invocations, not52 successful matches.

Brightness/translation/90-degree rotation each retrieve5/5,80%-size inset3/5.
No threshold, pattern, label, source, gallery or gate is retuned after observing
these results. The five duplicate lookups and20 correlated transforms cannot be
advertised as a25-photo real-world product-accuracy result. The27 other source
images establish only this reference-image confusion check, not verified SKU
absence. Shared backgrounds/copied graphics/near-identical SKUs and changing
package faces still need independent real-capture testing.

Actual Mac run wall time894.17ms covers all52 extractions/51 matches plus decoder
work/receipts/final integrity checks in its measured region. This is one warm
host run, not iPhone latency, peak memory, battery or cold-start acceptance.
No native/Android/offline-phone/VoiceOver claim follows. Core has no networking;
that source fact is not a new airplane-mode device test.

## Regression and review evidence

**79 new synthetic/no-image tests:**15 extraction,57 matching,7 runner/accounting.
They cover malformed/oversized inputs, typed-array ownership, blank/blurred
images, geometry, descriptor ties, unknown/ambiguity, duplicate IDs, multi-view
aggregation, iteration bounds, fixed planned identities/statuses and missing
denominators. Three reproduced custom-iterator failures were repaired before
real images; lengths are captured and copies use bounded numeric indexing.
Eligibility-before-ranking and stable reference tie-breaks are also repaired.

Pre-call independent review repairs a version-only decoder freeze and a summary
that could accept invented outside IDs/unknown statuses. Freeze now binds67
source/loader files and58 decoder-package/native artifacts; final checks match.
Summary requires the exact frozen grid, recognized statuses and no product ID
on abstentions. OS/Node/broader transitive runtime remain trusted prerequisites,
not an independently reproduced execution environment. Independent post-run
recount verifies all52 keys/53 row+summary files/32 image hashes and sole ledger,
without rerunning images. Prior failed learned heads remain unshipped.

Fresh `pnpm validate:shared` passes326 overlapping shared cases/builds.
Full `pnpm validate` passes**1238 unique tests:591Node+647application**, all
boundaries/format/lint/strict types/workspace builds and18 exported routes.
Pinned pnpm11.16/Node26.4; no fresh Linux/Node24/GitHub-CI or live advisory pass.
No visual/browser check needed for unchanged UI; this is not a new native build.

Private evidence: `work/own-pixel-2026-11-10.j6ExSM/`.

- `freeze/lock.json`:1754502d7558847885536f5f73d36c00322c5e56003e2dc93b4aeb9deef276e0
- `result/summary.json`:6e1ec4840200290b785e6d7319c2d0c33a88b1de358ee8276b2b1b6ef325e051
- `validate-shared.log`:56ac72bc51a72b1a741b0723d0c8310c3cdf547db4b576c950a21b1f30c9f133
- `validate-full.log`:285aa001bf4c169e08773dc96a1923df361b27240fa25819ecafd2c9fdf76768
- Canonical `work/reference-pixel-v1-attempt.json`:cda5897f38a6b4707d54068e36230cbfd3f3dc185ba9f9a9fdfb92201cd02dd8

sharp0.35.5/libvips8.18.7 is QA-only, explicit existing tool path; no dependency
install/lock change. Existing tsx emits Node's module.register deprecation
warning, not an image failure. No key/account/payment, user-data deletion,
phone/signing/install or GitHub publication. Existing LV-001/PHOTO and production
NO-GO remain: next implement a strict identity/rights-provenance multi-view
catalogue importer before requesting independent capture/review or integration.
