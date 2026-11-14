# Research conclusion after the first implementation

See the frozen pre-experiment [research/implementation plan](multimodal-recognition-plan-2026-11-14.md)
and [exact native evidence](../final/OCR_ATTRIBUTE_RESULTS.md).

## Answer: how can this work?

Use a hierarchy of observations, not a forced all-products classifier:

1. Capture one package with readable details; check quality/region before inference.
2. Read a visible barcode when available; otherwise retrieve visual candidates.
3. Read name/brand/variant/net quantity from the same photo locally and reconcile
   them with source data. Explicitly preserve contradictory/missing information.
4. Return the product family if only that is supported; request a closer name/
   quantity or barcode view for a precise variant. Do not pretend a family hint
   is an exact SKU or rewrite the failed historical exact-SKU acceptance gate.
5. Identify/confirm the actual packaging part/material, then apply the separate
   source/version/jurisdiction-bound recycling rules. Product name is not a bin.

This is feasible with current native tools and own matching logic. It does NOT
mean every single photo contains enough information or all source metadata is
true. The implemented experiment now supplies direct local evidence: same corpus
7→10/17source agreements, no wrong/lost candidates,41audits unknown. The gains
come from3text-supported Nutella size distinctions; no generic recognition or
five-SKU quality pass. Allfivepilot exact matches still fail, fixed gate unchanged.

## What is required now

| Requirement | Actual status | Engineering consequence |
| --- | --- | --- |
| On-device image/OCR execution | Existing native engine plus actual58image run | No new cloud key or per-query paid service |
| Name/brand/quantity catalogue |5cached OFF source records with provenance | Small initial catalogue, not global product coverage |
| Own evidence algorithm | Strict source-attribute parser/fusion implemented/tested | Candidate/family/unknown stay distinct; no confidence percentage |
| Readable variant evidence | Missing/unread in remaining bounded OCR outputs | Implement guided close-up/ROI capture, not invented amount |
| Representative data | Source-labelled400pximages, seen development | Add varied close-up/background/near-variant/open-world evaluation later |
| Native app activation/parity | Not wired to default UI or new phone build | Capability/data/privacy/physical validation before enabling |
| Recycling answer | Existing separate rule domain | Confirm material/part/deposit; retain all rule provenance |

## First prototype outcome and limitations

The five unresolved pilot outputs include logo/name text but no successfully
parsed net amount; some words are truncated or stylized. OCR absence is not proof
that physical print is absent. Native's24line suppression and single language
policy are also explicit limits. Do not fix this by letting OCR hallucinate digits
or by selecting a model solely because it returns more confident words.

The next implementation should help the user frame the NAME and NET QUANTITY
and allow bounded region re-reading on the same image. If another photo is needed,
record that as a distinct observation and require user confirmation of the package;
do not fake same-image hashes. Native ROI bounds/orientation, total deadline,
transient image handling and cancellation must be tested. No raw photo/text history
or analytics, background upload or silent acquisition. Exact-SKU/family/unknown
results and all historical failures remain separate metrics.

The evidence supports this implementation direction, not guaranteed release
accuracy. No model was trained from scratch, new weights installed, key used,
paid call made, phone updated or GitHub branch changed. Separate human checker
stays owner-waived/unperformed; operational/licensing/privacy/platform facts are
not waived. The scoped data-quality skill prevented denominator and source-truth
inflation. Public release remains NO-GO, local implementation continues from this
measured information gap rather than repeating a completed null experiment.
