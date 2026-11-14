# OFF corpus expansion: image availability and leakage controls

Accessed November14,2026. Scoped data-quality companion to recognition
implementation; not another accuracy report or independent human review.

## Why this source check was necessary

Earlier selection used only current selected-front language views. That left
Prince without a query and Coca-Cola without two reference images. The new
implementation decision requires checking the full original-upload inventory,
not repeating completed recognition experiments or replacing the five SKUs.

The official [image-structure guide](https://openfoodfacts.github.io/openfoodfacts-server/api/how-to-download-images/)
distinguishes numeric originals from selected language crops through `imgid`.
Its [AWS guide](https://openfoodfacts.github.io/openfoodfacts-server/api/aws-images-dataset/)
documents anonymous direct400pxobject URLs and warns that monthly synchronization
can leave objects absent. The [licence guide](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/)
retains ODbL/DbCL/imageCCBY-SAboundaries and other-rights caveats. No restricted
page, redirect, credentialed service or requester-pays operation is used.

## Observed metadata, not photographs verified

Five serial bounded public API reads return five snapshots. Names/brands/quantities
match the earlier source records; no identity truth is inferred from that match.

| Source SKU | Numeric originals | Valid credit/date/400px metadata | Unseen metadata batches | Candidate requests | Review images received |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nutella400g | 144 | 143 | 83 | 6 | 4 |
| Nutella750g | 53 | 52 | 25 | 6 | 6 |
| Coca-Cola330ml | 174 | 173 | 115 | 6 | 3 |
| Barilla SpaghettiN5 500g | 108 | 106 | 44 | 6 | 6 |
| Prince300g | 174 | 173 | 84 | 6 | 6 |

Grain is `(sourceGTIN,numericUploadId)`, NOT independent capture. Same-author
adjacent upload gaps≤24h stay in one transitive family. Families overlapping
old21upload IDs or old same-author upload-day±1day are excluded from new
candidates. Different author/time batches still do not prove photographic
independence. First six eligible families are fixed before pixels/model scores.

## Findings and remediation

- **Missing selected-parent join, medium, observed:** Barilla `packaging_it`
  points to nonexistent original60. V1correctly refuses it but over-rejects the
  entire otherwise usable record. V2quarantines only that annotation, preserves
  all valid originals, and reproduces the unaffected four plans from cached
  responses. No new API requests, invented image or source acceptance.
- **Metadata versus usable appearance, high, observed:** of30fixed requests,
  25produce bounded images and5fail response status/type validation. Exact server
  cause is not retained by the existing helper; do not call them proven missing
  objects or silently fetch another origin. All failed rows remain.
- **Selection bias/leakage risk, high, still controlled but not independently
  resolved:** nine received images are text/label crops, one is a multi-can scene,
  three are clean product depictions/illustrations, nine show front/near-full
  packaging and three near-full backs/sides. Those are agent observations at
  contact-sheet resolution, not verified GTIN, size, privacy approval or physical
  captures. Whole-product test roles require an explicit allocation next, not
  automatic replacement by reserves after seeing recognition results.
- **Near-duplicate proxy limitation, observed:** no exact decoded-pixel duplicates
  are found among25images. One64-bitdHash pair links Nutella and Prince nutrition
  panels at distance4; visual inspection shows similar table layout, not evidence
  of identical product/image. Do not merge identities or certify independence
  from a perceptual hash. Old benchmark captures remain unverified.

The data-quality skill influenced these conservative family/denominator checks
and the separation of metadata availability from usable appearance. It did not
create a new human-review gate. No statistical accuracy or confidence rating is
derived from these counts. Age of upload is not capture time or current Finnish
packaging; allocation must retain that uncertainty.

## Inspectable implementation and evidence

`scripts/qa/reference-image/expand-off-corpus.mjs`,
`prepare-off-expansion-v2.mjs`, `scripts/qa/inspect-off-expansion.mjs` and their
16regressions preserve exact checks. Existing projectMarkdown evidence is the
selected output; no additional notebook/dashboard/public artifact is generated.
See `docs/final/OFF_EXPANSION_RESULTS.md` and
`OFF_EXPANSION_VISUAL_REVIEW.json` for frozen hashes and per-image observations.
