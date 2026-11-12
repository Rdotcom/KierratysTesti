# Own pixel V2 comparative protocol — November12,2026

**Pre-call protocol. No result is claimed here.** Source/hash/runtime/gallery and
all rules below freeze before the single explicit run. Previous V1 results,
protocol, canonical attempt marker and frozen receipts remain immutable. V1
algorithm bytes must still match its original lock. The new V1 comparison is an
explicit baseline on an expanded gallery/query plan, not a replay or replacement
of the original V1 experiment.

## Task and fixed inputs

Compare existing own V1 pixel descriptors/matcher with the distinct scale-aware
V2 representation/matcher, not a new pretrained encoder or threshold search.
Current source and all gates are pinned by the new lock. Reference candidates
remain unverified/uncalibrated; no pixel result proves identity/material/bin.
The catalogue-provenance importer is separate and not bypassed by benchmark IDs.

Reuse exactly52 already-seen licensed/privacy-reviewed public JPEGs:

- Robustness32: `scripts/qa/local-vision/robustness-manifest.json`, SHA
  `b822665aa26031a9f64c16e99fc11b2e12e0c62614c7db7dbd21bb052850ec5f`.
- Spatial20: `scripts/qa/local-vision/spatial-data-manifest.json`, SHA
  `e6567b3d7ba522e59787fc9ff0419950c36755ee789a36b673728ab598401220`.

These images were previously seen and labels remain AI-reviewed/human-required.
Neither source titles nor coarse-kind labels are verified product/SKU truth.
No new acquisition, user photo, exact-product relabelling or failed-case removal.
Keep all original source/hash/licence/group metadata and both related historical
transistor-box sources outside the gallery. This is expanded **SEEN engineering
development**, not a fresh held-out identity or independent camera benchmark.

Fixed10-image gallery for each engine: bottle-classic, jar-screw, box-netgear,
bag-kenya, cup-hanoi, bottle-banks, jar-saffron, box-juul, bag-coffee,
cup-coffee2025. Engine-specific descriptors use the same photograph IDs and
pixels. The42 other originals are non-gallery reference-ID controls, not proof
that their actual SKU is absent. No catalogue names/GTINs are fabricated.

## Transform/query/execution plan

Each engine gets112 fixed queries:52originals plus60 correlated transforms
(six per gallery original). Fixed raw transforms:

1. Brightness:0.85x+15 with clamping.
2. Translation:4%width/3%height, gray127 fill.
3. Clockwise90-degree rotation.
4. 80%-size centered inset, gray127 fill.
5. 60%-size centered inset, gray127 fill.
6. 60%-inset, then90-degree rotation, then the fixed brightness transform.

These are synthesized views of the same10 photos, **not60 independent photos**.
Keep exact V1 arithmetic for the four corresponding earlier transforms.
Decode each of52 original JPEGs once to oriented sRGB/max384 inside bounds with
the explicitly selected existing sharp decoder; both engines share those raw
pixels. Original and synthetic image pairs each have one extraction per engine:
maximum224 feature extractions/224 match calls. Zero model predictions, fitting,
paid API calls, user acquisition or network. Low-detail/invalid/failed outputs
stay in the112-per-engine denominator; an unavailable gallery view is not dropped.

`scripts/qa/reference-image/evaluate-v2.mjs` freezes algorithm/public-export/
catalogue source/tests, invoked QA validators/helpers, manifests, loader, lockfile,
decoder entry/package/native artifacts and Node/platform identity. Check again
before/after the run. The wider OS/transitive runtime remains trusted, not fully
reproducibly attested. Canonical `work/reference-pixel-v2-attempt.json` is written
exclusively before processing; copied locks/new outputs cannot silently rerun it.
Never remove/reset either V1 or V2 marker to retry a failed gate.

Retain52 decode receipts,224 extraction-attempt receipts and224 exact keyed
engine/query result receipts plus summary. Actual per-row extraction/match
attempt counters reconcile to global counters. Hash/source drift is an integrity
failure, not silently accepted data. Exact output failures, missing keys and all
planned denominators remain explicit. There is no after-result retuning/retry.

## Fixed comparative gate

All224 `(engine,id,variant,known)` observations must exist exactly once with
the frozen identities, supported result states and valid attempt counts.
V2 must retrieve all10 original gallery photographs, produce zero wrong
candidates/invalid outputs/operational failures, lose none of V1's correctly
retrieved positive queries and gain at least6 additional correct synthetic
retrievals (V2 total minus V1 total). Unknown and ambiguous candidates remain
abstentions; report ambiguity counts rather than calling them identities.
The V1 baseline must also have zero invalid outputs/operational failures; an
execution-broken baseline cannot establish a comparative improvement. This
strictness was approved before any pixel processing; low-detail/unknown outputs
remain valid abstentions in either engine.

All-abstain is a failure. Better aggregate coverage cannot hide a V1-correct
loss or a new wrong identity. No gate/label/source/threshold change after results.
**Integration remains forbidden regardless of gate outcome.** A pass would
establish only this seen-reference engineering comparison, not representative
product recognition, exact SKU absence, real camera/native performance, human
identity/rights review or material/sorting policy accuracy.

## Reproduction and authority

Run no-image evaluator/domain tests first; finish source review before freezing.
With explicit existing `SHARP_MODULE_PATH`, run
`node scripts/qa/reference-image/evaluate-v2.mjs --freeze work/new-freeze`, then
`--run work/new-freeze/lock.json <reported-sha256> work/new-result` only after root
approval. Missing local fixtures/prior receipts fail this optional experiment,
not silently skip mandatory CI tests. Test fixtures do not use real images.
