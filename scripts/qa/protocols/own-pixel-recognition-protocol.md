# Own pixel reference recognizer — frozen protocol, November10,2026

Implement our own feature extraction/matching arithmetic, not another trained
head on an external encoder. This is an original code implementation of known
classical corner/binary-description/geometric-consensus ideas, **not a claim to
invent Harris/BRIEF or a universal AI model**. No pretrained weights, service,
API key, per-query charge, inference library or network is needed by the core.

## Intended task and boundaries

Input is bounded RGB pixels; derive two-scale Harris corners, rotated binary
patch descriptors, mutual distinctive Hamming correspondences and deterministic
three-point affine consensus. Require eight spatially spread inliers and65%
consensus within0.025 normalized reprojection error. Multiple qualifying product
IDs are ambiguous; weak, low-detail or unknown inputs abstain. Descriptor and
matching policies are versioned in pure shared-domain code/public exports.
Use the explicit experimental `@kierratysappi/domain/reference-vision` entry;
the app's ordinary domain entry does not import it.

An explicit catalogue is necessary. A result returns only an unverified reference
candidate ID and descriptor/geometric evidence, not a product name generated
from pixels. Future names/GTINs must come from separately reviewed identity and
image-rights provenance. Similar designs, shared backgrounds, copied labels,
opposite package faces, glare, deformation, mixed scenes and perspective changes
can defeat this method. Affine consensus is not object segmentation or proof
that the full scene contains only one object. No material/safety/deposit/bin
answer, automatic recycling record or verified identity follows from similarity.

No UI route/default recognition/model replacement or camera/network/privacy
change is included in this prototype. Current signed client10 remains unchanged.
Real enrolled catalogue/independent views/native adapter and acceptance are
required before integration; existing PHOTO/LV/release findings remain open.

## Closed engineering experiment before real pixels

`scripts/qa/reference-image/evaluate.mjs` fixes source/data/runtime hashes before
processing. Use exactly32 already-seen, AI-reviewed public JPEGs from the existing
rights/privacy-cleared robustness manifest, SHA
`b822665aa26031a9f64c16e99fc11b2e12e0c62614c7db7dbd21bb052850ec5f`.
No acquisition, relabelling or source/failed-case exclusion.

Freeze the invoked local QA controls/validators, loader sources and explicit
decoder entry/package/native-library files as well as algorithm/tests/policy.
Their byte hashes are checked before/after the run; OS/Node and broader
transitive-runtime integrity remain a trusted local prerequisite, not a claimed
reproducible Linux/native-mobile execution environment.

Five fixed gallery source IDs: bottle-classic, jar-screw, box-netgear, bag-kenya,
cup-hanoi. These IDs identify **reference photographs, not verified SKUs**.
The27 other originals test open-set reference confusion, not proven SKU absence.
Keep both shared-family historical transistor-box originals outside the gallery.
All images were already seen; none is called a fresh independent holdout.

Decode each original once to oriented bounded sRGB with the explicitly selected
existing sharp/libvips tool. Own code handles normalization/feature extraction.
Five original self-lookups are duplicate-retrieval sanity checks. Twenty gallery
queries are fixed raw-pixel brightness(0.85x+15), translation(4%x/3%y),90-degree
rotation and80%-size gray-inset transforms. They are correlated synthetic
queries, **not20 new photos or independent product-accuracy trials**.

Maximum32 decodes/52 feature extractions/52 match decisions, zero model
predictions/fits/paid requests; one canonical once-only run marker. Preserve
individual results, required failures and all32+20 planned denominators. A
low-detail gallery remains a failed retrieval opportunity, never dropped.
Freeze source/gates/catalogue/transforms before pixels; no post-result tuning,
retry/relabel or promotion of this engineering set to product-accuracy evidence.

Engineering gate: all5 self-retrievals, at least16/20 synthetic correct,
zero wrong candidates/ambiguities/required failures and all52 rows observed.
Pass would establish only this narrowly defined engineering gate. **App
integration is disallowed regardless of outcome**, pending independent actual
same-product/different-capture positives, similar-package/different-product
negatives, mixed scenes, rights/identity review and mobile performance/privacy
acceptance. A failed gate is retained without changing thresholds to reach green.

## Primary technical references (accessed2026-11-10)

- [Harris and Stephens,1988](https://www.bmva.org/bmvc/1988/avc-88-023.html):
  local gradient second-moment corner response. Own arithmetic, not copied code.
- [Calonder et al.,2010 / EPFL](https://www.epfl.ch/labs/cvlab/research/descriptors-and-keypoints/research-detect-brief/):
  binary intensity comparisons and Hamming descriptors. Our fixed seeded pattern
  is generated locally, not copied from a trained or third-party implementation.

## Reproduction

Run synthetic domain/evaluator tests first. Set `SHARP_MODULE_PATH` explicitly to
an existing installed sharp module, without installing app dependencies. Use
`node scripts/qa/reference-image/evaluate.mjs --freeze work/new-freeze`, then
`--run work/new-freeze/lock.json <reported-sha256> work/new-result`. Existing
licence-cleared private fixture directories must be present; missing artifacts
fail this optional experiment, not silently skip mandatory CI tests. Never delete
the canonical attempt marker to repeat a failed experiment.
