# Local Vision baseline specification — 2026-11-03

Frozen before first image inference. This is a development baseline, not a
newly trained model or production accuracy acceptance. Apple's installed
classification/OCR models plus our own conservative logic run locally; no API.

## Scope

- iOS first, with identical Swift engine source in a macOS diagnostic CLI.
  Android/web/older binaries explicitly report local unavailability, not a
  silent paid fallback. Existing separately consented cloud entry remains.
- Pin classification2 on iOS17/macOS14+, otherwise1; OCR3. Record revisions,
  OS, actual OCR languages/date. Scores are not calibrated factual probabilities.
- Exact labels: bottle/wine_bottle→bottle, jar→jar, carton/cardboard_box→box,
  paper_bag→bag, cup→cup. Never substring-match can/glass/food/container to
  materials or safe packaging. No beverage-can label is supported here.
- Provisional score>=0.55 and lead>=0.15 over another category; abstain for
  low/conflicting/unsupported scores. These gates are not tuned on these images.
- OCR must be an entire consistent abbreviation+number line checked by the
  existing parser. No bare number/date/GTIN-substring or conflicting marking.
  Only explicit user comparison/confirmation can enter the existing rule flow.
- No brand/SKU/material/hidden part/deposit/emptiness/safety/destination guess.

## Diagnostic images and procedure

Reuse the eight existing licensed public JPEGs in ignored
`work/photo-products-2026-10-15.KstrPe/`, validate SHA256/bytes against
fixtures.json; attribution remains in PHOTO_PRODUCT_EVALUATION. No new download
or user photo acquisition. The engine receives only bytes, never the expected
name/GTIN/filename. One execution per image, no selected best result/retry.

| Existing case | Visible-form reference | Not established |
| --- | --- | --- |
| nutella | jar | actual material/variant |
| coca-cola | can outside supported whitelist; do not claim can recognition | metal/deposit |
| barilla | box | inner packaging/material |
| prince | wrapped/bag-like; may abstain | hidden parts/material |
| nutella-biscuits | bag; may abstain | true polymer |
| heinz | bottle | exact identity/material |
| badoit | bottle | identity/material/deposit |
| quaker | box | recipe/hidden bag |

These are previously inspected DEVELOPMENT pictures, not independent held-out
data. Report each result/abstention/time including failures; no representative
accuracy claim. Do not relax the gates afterward to make this set pass.

## Regression and acceptance gates

- Strict bounded image/output validation, no URL/path/native networking, no
  image/OCR logs; exact-vs-substring labels, unsupported/low/conflicting scores.
- Complete marking vs dates/numeric fragments/composites/conflicts, explicit
  confirmation, existing rule provenance/uncertainty. No automatic sorting.
- Native unavailable/busy/error, timeout/cancellation/late-result rejection,
  single-flight until uncancellable work settles; blur/background clears media.
- Local route never fetches capability/provider/recognition or silently invokes
  cloud; camera file deletion, no image/OCR history/analytics/persistence.
- FI/EN/dark/narrow/large text/accessibility recovery and current barcode/manual/
  explicit cloud paths. Compile/run actual engine and pass free software checks.
- Native linking/build, installed phone camera/UI, latency/memory/battery and
  independent real-camera unknown/hazard data remain separate mandatory gates.
  Mac results or an unavailable bridge are not a finished universal recognizer.

## V2 semantic correction — frozen before the second diagnostic run

Preserve the V1 eight-image results:8/8 executions succeeded, but all abstained.
Do not relabel that as a model accuracy result or relax its numeric thresholds.
Apple's authoritative WWDC2019 session222 (10:42–13:09) explains that this
classifier is multi-label/hierarchical and its scores are comparable within a
class, not across classes. The V1 maximum/margin/unsupported-parent algorithm
therefore does not match the API semantics. This correction is justified by
that source, not by choosing thresholds that fit these eight pictures.

V2 is independently versioned (`local-vision-v2` and normalizer/abstention-v2):

- Native returns all seven exact supported identifiers, not a selected top-N.
  For each, use the engine's precision/recall curve and
  `hasMinimumRecall(0.01, forPrecision: 0.9)`. No curve means not accepted;
  missing labels are explicit non-acceptance, never an invented observation.
- Record fixed operating-point policy, requested precision/recall, true native
  curve/pass flags, revision/OS. These are Apple's class operating points,
  NOT measured packaging precision or calibrated field safety guarantees.
- Group independently accepted labels by the five object kinds. Zero kinds
  abstains, multiple distinct kinds abstains; one kind gives only a tentative
  visible-form estimate. Parent container or scene tags do not veto a child.
  Never max-compare confidence across classes or return material/risk/SKU/bin.
- Repeat the same8 only as a disclosed V2 DEVELOPMENT diagnostic, one execution
  each/no selection, retaining V1/V2 source/binary/schema hashes and all outcomes.
  This is not a new independent held-out set or a production GO.
- Add a separate owned synthetic-text JPEG diagnostic (PET1/05PP/negative date)
  to test OCR/marking handoff only; not an actual product/real-camera benchmark.

Primary source accessed2026-11-03:
https://developer.apple.com/videos/play/wwdc2019/222/
