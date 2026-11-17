# OFF cross-upload development diagnostic — November13,2026

**Not release acceptance, independent ground truth or an accepted catalogue.**
This source-reported development experiment must freeze before any feature/
matching work. It does not upgrade community labels, copyright/other-rights
review, capture independence or human acceptance. No performance result is
claimed in this protocol. Existing LV/PHOTO/public-release gates remain open.

## Source, privacy and byte joins

Use only the fixed five source-reported OFF product records and21 deduplicated
proposed uploads in `scripts/qa/reference-image/off-initial-selection.json`, SHA
`904d38041e528dfaff897ebcef3f8bd5436411a7b1d138cd561bb9d397170ef8`.
Their names, GTIN associations, sizes, authorship and selected-view labels are
community assertions, **not verified product identities**. Near-looking Nutella
400g/750g records remain separate source assignments, not silently merged.

The acquisition manifest and every per-case receipt must match the selection
and each other. Hash actual original JPEG/review PNG bytes and preserve the
source/review transform/credits. Current acquisition or explicit recovery
manifests may be input; the latter must preserve the original21GET attempt/
19ready+2MIME failures and its independent two-case recovery counters. Bind
the actual base manifest and diagnostic files too; do not rewrite acquisition
history as an originally successful21-image fetch. All21 observations remain.

Before freezing, the main agent must actually inspect available review images
for development privacy and write a separately hash-bound operational screen:

```json
{
  "schemaVersion": "off-development-privacy-screen-v1",
  "acquisitionSha256": "<actual final manifest hash>",
  "humanAccepted": false,
  "integrationAllowed": false,
  "rows": [
    {
      "blindId": "case-001",
      "reviewImageSha256": "<actual ready PNG hash>",
      "decision": "allow_development"
    }
  ]
}
```

The real file requires all21 unique case IDs. Ready images require their exact
PNG hash plus `allow_development` or `exclude_privacy`. Failed/unavailable rows
require null PNG hash and `unavailable`. This is an **AI operational privacy
screen for private local development**, not independent human review, legal/
rights clearance, identity verification or public redistribution authority.
No matcher, image decoder, synthetic photo, download or review acceptance is
performed by the metadata-only unit tests or automatically by preparing a plan.

## Frozen deterministic enrollment and queries

Within each source-assigned product, sort original upload IDs numerically and
select the first two ready, privacy-allowed uploads **before feature outcomes**.
Only a product with at least two such uploads is enrolled for this diagnostic.
The two selected images supply two separate **exact gallery-self lookups**.
Other uploads from that product are cross-upload development observations;
failed/not-attempted rows remain failed/unavailable in their planned denominator.
Privacy-excluded rows are withheld and retained, not decoded or replaced after
results. Classes with fewer than two usable source uploads report insufficient
gallery; do not imply evaluation coverage for Coca-Cola's single upload or
independent cross-upload testing for Prince's two gallery-only uploads.

All21 selected uploads receive exactly one final case receipt, including
insufficient-gallery, withheld, source-failed, low-detail, invalid and failed
operations. No missing case, output substitution or counter mismatch can become
complete evidence. If a fixed gallery descriptor is low-detail/unavailable,
do not switch enrollment to a later upload after observing recognition results.
Report actual usable gallery descriptors separately from the selected sources.

Decode only privacy-allowed enrolled-class review PNGs with the trusted pinned
decoder/Node RGB adapter; no download, cloud/ML, prompts, training or phone call.
Review PNGs are orientation-baked/metadata-free derivatives, not independent
new photographs. Maximum21 decodes/21 own V2 feature extractions/21 matcher
calls; actual counts are written per case and reconciled globally. Reuse each
selected gallery descriptor for its self-lookup rather than extracting twice.
The ordinary app/catalogue runtime remains unwired; no fake accepted review
metadata is generated to pass its stricter production-import boundary.

Feature receipts hash JSON of the complete extraction result (including status
and any feature object/reason), using `development-json-extraction-result-v1`.
This is not the production runtime's features-only canonical serialization.
Candidate receipts must retain V2 inferred/uncalibrated metadata and an exact
enrolled reference-ID/image-hash join. Duplicate gallery claims are recomputed
from the recorded source/review/pixel hashes, not accepted as caller assertions.

## Duplicate and result interpretation

Record exact original-encoded-byte, review-encoded-byte and actual decoded RGB
hash groups. Dimension-prefixed pixel hashes flag identical pixels even if the
encoded bytes differ. Specifically flag matches across gallery/query uploads
and exclude these from any **nonduplicate source-label-agreement** subtotal.
Keep every duplicate in the overall case record; it is not a new independent
test. Exact hash inequality does not establish independence or rule out crops,
re-encodings, shared labels/backgrounds or repeated captures; independent human
duplicate/identity review is still pending for all cases.

Report gallery-self and cross-upload lanes separately as community/source-label
agreement, disagreement, abstention, invalid/failure/withheld counts. A source
label may be wrong, so neither an agreement proves identity nor a disagreement
alone proves an algorithm error. No percentage is published as product accuracy.
`humanAccepted`, `integrationAllowed`, `releaseAccepted` and
`independentAccuracyEstablished` remain **false regardless of the results**.
There is no production-quality pass gate in this diagnostic.

## Reproduction and no-retry boundary

New script: `scripts/qa/reference-image/evaluate-off-development.mjs`.
No automatic freeze/run: first finish source review, acquisition and the actual
privacy screen. Use `--freeze <acquisition-path> <sha256> <privacy-path> <sha256>
work/new-freeze`, then `--run work/new-freeze/lock.json <sha256> work/new-result`
only after explicit main-agent authorization. Freeze joins all data/review hashes,
algorithm/QA source, declared tsup bundle bytes, trusted decoder artifacts and
Node/platform before any image work. No incidental tsx path or dependency change.

`loadPinnedReferenceDecoder` authenticates the historical lock hash before entry
loading, verifies all58 artifacts and version pins. Its trust is not a complete
OS/module-cache/whole-toolchain attestation. Check decoder, compiled engine,
sources and source/review files again after execution. Write the canonical
`work/off-reference-development-v1-attempt.json` exclusively before image work;
never remove/reset it or earlier experiment ledgers to create a hidden retake.
All source images/derived assets/receipts stay in ignored private work storage;
do not commit images, completed review forms or operational/private paths.
