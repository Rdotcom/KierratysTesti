# Spatial disagreement development and prospective check — November7,2026

Freeze before the first spatial picture prediction. This is a separate
experiment after both A/B candidates failed the original robustness protocol.
Preserve those failures, null selection and baseline-only held-out audit. None
of their pictures becomes a fresh test case here. No paid service, user photo,
new encoder/weight, prompt or confidence-threshold change is authorized.

## Original algorithm

The failure motivating development is the already-seen validation bag-and-box
scene: a whole-image embedding can prefer one kind despite multiple objects.
Compute fixed overlapping regions, not filenames, labels, cloud captions or a
claim that the image's actual materials can be known.

After EXIF orientation, normalize image origin. Four fixed crops: left/right
full height and60% width, bottom/top full width and60% height. Each opposing pair
overlaps20%; they cover horizontal and vertical arrangements. Independently
aspect-fit each crop to centered256×256 sRGB on RGB127/127/127 with the existing
Core Image render/layout pipeline. Same pinned2024 image encoder/prototypes,
same loose cosine0.20/lead0.020 positive decision for every region. No averaging,
adaptive crop, saliency/model-guided region or threshold search. Four predictions
per spatial process execution; raw18 scores/actual pixel rect/preprocessing/view
IDs are retained. A region score is not factual confidence or an object count.

For a currently accepted V4 visible-form estimate only:

- **S1:** if any two confident supported region decisions disagree, return
  unknown; never substitute another kind.
- **S2:** same, but veto only when one of the confident kinds equals the
  baseline's accepted kind. Prefer this less restrictive guard on equal gain.

Unknown/conflicting/failed baseline remains unknown. Required spatial failure
returns unknown/spatial_unavailable and counts as operational failure, never a
successful veto, error removal or safe abstention. It does not erase primary/OCR
observations. Unused region failures for an already-unknown baseline are recorded
but do not become a newly introduced required-stage failure.

## Seen development data, not another held-out test

Use only the original16 validation cases and **captured** baseline/primary/center
results (`validation/summary.json`, SHA256
`fd86f9bad85d03775cfddab5edc2c79d88206f1e10ec5617defb9bb17c977ea2`).
Do not re-execute baseline or retune using original held-out predictions. One
spatial execution per case,16processes/64region predictions, all failures and
attempt markers retained. A development candidate must remove at least one
baseline wrong acceptance, introduce no wrong acceptance or required operational/
schema failure, retain **all** baseline-correct positives, and retain at least
five correct positives. Select most errors removed, then most correct, then S2.
If none qualifies, do not deploy or run prospective model tests for a loser.

## Fresh prospective confirmation

Before predictions, freeze a separately rights/privacy/hash/group-traced set
of20 new eligible JPEGs: ten positive forms (two per kind) and ten outside/mixed/
unclear controls, including at least five multi-supported-kind scenes. Exclude
every previously downloaded/evaluated source/hash/object family, including old
reserves; no training/validation tuning on this new set. Maximum40 candidates/
25MB; all visual eligibility decisions before predictions. AI-reviewed labels
still require independent human review; pretraining membership is unknown.

Freeze development selection and exact tools/model/prototype/protocol/reference
hashes before fresh calls. For each new case execute primary+center once, then
spatial once only if baseline accepts a kind. Required failures remain failures;
all20 cases stay in denominators. Only the one locked S candidate is evaluated.
No retake, replacement, hidden retry or choice based on this set's results.

Integration requires zero wrong/outside/newly wrong acceptances, zero
baseline-correct losses, no introduced required-stage/schema failure, at least
five correct positive acceptances, and at least one removed wrong acceptance if
the fresh baseline makes any. Otherwise retain the failed QA experiment and do
not claim or deploy a successful guard. Even a finite pass needs strict native/
contract/provenance tests, full validation and actual compiled-resource/parity
checks before integration; physical latency/energy remains unverified.

## What this cannot certify

Four overlapping crops are a bounded heuristic, not instance segmentation or a
guarantee to find all objects. Same-kind mixtures, tiny/occluded/nested objects
and partial-form confusions remain risks. No exact identity, material, hazard,
packaging/deposit or sorting truth follows from this result. Twenty AI-reviewed
catalogue pictures cannot certify real-world reliability; independent human
labels and representative real-camera/platform/accessibility/performance evidence
remain mandatory. Do not lower production-quality severity to obtain green.
