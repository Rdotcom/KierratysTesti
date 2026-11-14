# How product-photo recognition should be built

Research/decision,2026-11-14. The user requests evidence before implementation.
Success is testable, not guaranteed by a paper or a larger model. Preserve the
failed7/17baseline and rejected four-rotation experiment; do not retake them.

## Findings from primary sources

1. [Pettersson et al.,2024](https://link.springer.com/article/10.1007/s00138-024-01549-9)
   study similar grocery variants using image plus OCR features. Their separate
   image/text models complement each other; their data include different sides,
   fine details and many samples per class. Their trained classification setting
   is not our open-world phone retrieval task. Its results do not predict our
   accuracy, and a text-enabled rule matcher is not their learned fusion model.
2. [Unitail,ECCV2022](https://www.ecva.net/papers/eccv_2022/papers_ECCV/papers/136670695.pdf)
   separates locating, reading and matching products. Misaligned appearances and
   distinguishing packaging text are concrete challenges. This supports testing
   region alignment/text, not another blind full-frame rotation search.
3. [Apple Vision text recognition](https://developer.apple.com/documentation/vision/recognizing-text-in-images)
   runs on device, exposes text observations/bounds and supports accurate-mode
   recognition with explicit supported language settings. Existing native code
   already uses revision3/en-US/accurate/material-word lexicon; keep that exact
   policy for the first feasibility experiment, no outcome-tuned custom names.
4. [OFF API guide](https://openfoodfacts.github.io/openfoodfacts-server/api/)
   provides community product metadata, not guaranteed identity truth. Current
   guide recommendsv3.6for new integrations and states15product reads/min/IP,
   10searches/min/IP, no search-as-you-type and identifying User-Agent. Database/
   content/image licences remain distinct. Do not add live photo/text uploads or
   unbounded search. This experiment needs no OFF request:5metadata snapshots
   and all58test images already exist privately with recorded attribution.
5. [FineGrainOCR author's repository](https://github.com/Tubbias/finegrainocr)
   offers a high-resolution image/OCR dataset and CC0repository licence. It is a
   possible later research source, not an installed/trained/rights-reviewed model
   or proof of coverage for our five products. No bulk download is performed.

All accessed2026-11-14. The CVF2015PDF returns403; do not bypass/rely on unread
paper contents. No paid service, account, secret, new dependency or model download.

## Recommended architecture (our inference from research and observed failures)

| Stage | Purpose | Safe outcome |
| --- | --- | --- |
| Capture/quality/single-object region | Keep packaging details large, avoid background/shelf influence | Retake/crop when insufficient, never invent detail |
| Barcode if visible | Read explicit identifier with checksum and provider binding | Candidate catalogue record; not verified material |
| Visual retrieval | Suggest family/candidates from own features + existing local encoder | Unknown/ambiguity allowed; score not probability |
| OCR name/brand/quantity | Read distinguishing evidence from the SAME bytes | No fuzzy numeric correction or size guessed from shape |
| Late evidence reconciliation | Keep consistent evidence, veto contradictions, expose missing attributes | Inferred product/family, uncertain variant remains uncertain |
| Packaging confirmation + rule engine | User checks actual part/material/deposit/context | Source/jurisdiction/date/version/confidence/explanation retained |

An exact GTIN cannot generally be derived from a visually identical front. A
product family/name hint, exact source-SKU candidate and verified barcode lookup
are different outcomes. Neither image identity nor food category establishes a
bin. Mixed scenes, hazards, absent catalogue entries and contradictory text must
not fall through to a confident nearest neighbour.

## Options and requirements

| Option | Needed | Decision |
| --- | --- | --- |
| More cosine/rotation tuning | Same weak full-frame evidence | Rejected: completed null experiment; do not lower gates |
| Own foundation model from scratch | Large varied labelled corpus, training/evaluation compute, mobile conversion | Not justified by5SKUs/2refs; no fabricated cheap guarantee |
| New large local VLM | Suitable licence/weights, RAM/storage, mobile runtime and hallucination evaluation | Defer until evidence supports cost; no unapproved model/terms download |
| Small on-device image+OCR evidence system | Existing Vision/encoder, source-bound name/brand/quantity catalogue, own bounded matching/fusion, abstention and tests | Start here, no per-query cloud API required |

The next implementation must not be only a weight selector on cosine scores.
It needs a validated byte-bound OCR response, a small pure attribute parser,
explicit catalogue-derived discriminative name anchors and conflict handling.
An ambiguous visual family may be narrowed only by actual distinguishing text;
a visual unknown may be proposed from multiple distinct name anchors PLUS an
isolated matching quantity, never because it is the only catalogue entry.
Unknown/failed OCR cannot certify identity. Retain all source metadata and no raw
photo/free-text analytics, logs or history. No backend/secret is required.

## First bounded experiment, before any new prediction

- Same17product/41safety queries and all previous failures/roles; no image/label
  enters fitting and no query result selects phrases/thresholds. Use original
  single-view baseline, not the rejected fourfold query work.
- Read58same-image observations via the existing shipping native recognition CLI
  once. It performs existing classification+OCR and sometimes its coarse-form
  supplement; report actual supplement availability, not zero model work.
- Validate actual raw native contracts. Bind input bytes/hash/process/source/
  binary/response. Catalogue names/brands/quantities come from cached source
  snapshots, not filename, expected query label or a hardcoded per-case answer.
- Freeze parser/fusion rules and unit cases before seeing OCR output: exact
  bounded text anchors, isolated net quantities, unit conversion, no approximate
  numbers; block per100g/servings/multipacks/conflicting amounts and identities.
- Mandatory preservation:≥14/17source agreements, allfivepilots,0wrong/oldsevenloss/
  safety-nonunknown/native/schema failure and all58rows. Report name-only hints
  separately, never count family as exact SKU or change denominators to pass.
- If quantity is not visible/readable, retain ambiguity. A failed gate indicates
  the next information gap (resolution,ROI,reference breadth or catalogue), not
  an account/paid API/reviewer blocker. No app activation from this feasibility
  run; it is source-labelled development, not real-camera/physical acceptance.

## Remaining deployment requirements

After measured useful coverage: trusted mobile byte/OCR integration and resource
parity, explicit product/family/unknown UI, barcode/manual recovery, local image
deletion/no background photo work, localization/accessibility, real-camera/offline/
permission/latency/energy tests, Android capability/fallback and actual licensing/
privacy/store/operational acceptance. Owner-waived independent checker remains
unperformed; no new human-review prerequisite or automatic push/install.

Scoped data-quality skill supplies source/role/denominator/seen-test safeguards;
existing researchMarkdown/scripts remain the deliverable, no extra dashboard or
notebook. This is an executable plan with falsifiable gates, not a promise that
unseen products or hidden print can always be recognized.
