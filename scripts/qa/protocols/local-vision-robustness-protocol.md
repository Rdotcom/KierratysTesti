# Local recognition reliability experiment — frozen before new picture calls

Date: 2026-11-07. Authority: Roope asks to continue improving reliability and to
create original algorithms when useful. This does not authorize paid calls,
user-photo reuse, signing/install, cleanup, publication or fabricated certainty.

## Scope and limits

Predict only five **visible forms**: bottle, jar, box, bag and cup. Neither
algorithm establishes exact product, real composition, packaging status, hazards,
deposit eligibility or sorting destination. Reusable cups and chemical bottles
can be correct coarse-form positives, with context-challenge markers, not false
outside-kind negatives. Truly outside-kind, mixed-kind and unclear whole-image
cases require abstention. OCR and independent material confirmation are unchanged.

These are our own bounded decision algorithms using fixed pretrained encoders,
not a foundation model trained from scratch. No score is factual confidence.
The experiment can falsify a candidate; it cannot certify representative
real-camera quality from AI-reviewed public catalogue pictures.

## Frozen inputs and reference labels

Create a separate rights/privacy/hash/group-traced corpus before any inference:
target32 new eligible JPEGs,20 positives (four independent object groups per kind)
and12 outside/mixed/unclear controls. Validation and held-out each contain ten
positives (two per kind) and six controls. No training, prior evaluated bytes or
same source-object family in another split. Acquire at most60 candidates/35MB;
exclude privacy/eligibility failures before calls and record them. No replacement
of a disappointing result. Labels are AI-reviewed, human-review-required;
pretraining membership is unknown. Freeze exact manifest bytes before inference.

## Models, views and unchanged baseline

Use the exact pinned2024 MobileCLIP-S0 image model/prototypes/prompts and existing
loose gate (cosine0.20/lead0.020), not new thresholds or text prompts. Existing
original2024 licences/notices and source hashes remain. Center view is the prior
center-square256 sRGB CLI, unchanged. Second view applies EXIF orientation and
aspect-fits the entire image into a centered256×256 sRGB canvas RGB127/127/127,
using the same Core Image interpolation/render/color/layout pipeline. Record its
actual different preprocessing ID; do not label it center-square.

Use the frozen V3 primary/OCR executable, whose seven-label policy is identical
to the primary stage of current V4, plus the fixed center CLI. Reconstruct the
current V4 baseline: primary accepted kind wins; primary conflict/error is
unknown; only primary no-match can use the current center loose decision.
This is explicitly a decomposed comparison, not an end-to-end phone test.

## Exactly two original candidate algorithms

- **A — contradiction veto:** primary conflicts/errors remain unknown. No-match
  uses the unchanged center decision. A primary single kind stays unless the
  center global winner has cosine>=0.20 and lead>=0.020 and is a different
  positive or any outside group; then return unknown, never substitute a kind.
- **B — two-view agreement:** primary conflicts/errors remain unknown. Both
  center and full-frame views must independently pass the unchanged loose
  positive gate with the same kind. Any primary single kind must agree too.
  Otherwise return unknown. Required model failures are unknown, not success.

No averaging, majority override, prompt/threshold search or primary-conflict
repair. These are veto-only relative to V4: do not claim improved coverage merely
because fewer answers are issued. OCR remains separately unconfirmed.

## Execution, accounting and validation-only selection

Freeze protocol, references, binaries, sources, model and prototype hashes before
calls. Each eligible image runs primary, center and fit once on validation: at
most48 executions for16 cases. Record every raw output, exit/error/wall time and
post-run hash. Apply the already documented exact expected-failure-envelope
accounting; failure remains operational failure/unknown and in the denominator.
Malformed/extra-key/unknown/crashed results are invalid. No retries/retakes.

Report per case and aggregate: correct accepted positive, wrong accepted kind,
outside/mixed false acceptance, safe abstention, operational failure, lost
baseline-correct positive and removed baseline wrong acceptance. Do not use
accuracy alone to reward an always-unknown classifier.

Candidate eligibility on validation: zero wrong accepts, zero newly wrong per
case, at least one baseline wrong acceptance removed and no more than one
baseline-correct positive lost, with no introduced required-model operational or
schema failure (a failed required model is not a successful veto). Record unused
extra-view failures too, without attributing them to algorithms not requiring
that view. Require at least five correct accepted positives out of ten as a
nontrivial coverage floor; an always-unknown candidate cannot qualify. This is
an engineering gate, not a real-world50% coverage claim. Select most correct accepted among eligible,
then A on a tie (lower computation). If baseline has no wrong acceptance, neither
candidate earns deployment by agreement alone; preserve baseline. Lock selection
and exact hashes before any held-out call.

Held-out tests baseline plus the one locked candidate, not both candidates or a
threshold search. Execute primary+center once per case, and fit only if B was
selected:32 or48 executions. With no selection, audit baseline only and retain
the unused fit/algorithm comparison; do not select from held-out results.
Integration requires zero wrong/outside/newly wrong accepts, no more than one
baseline-correct loss, at least five correct accepted positives and no introduced
operational/schema failure. Otherwise
preserve current production classifier and record the failed candidate. Source,
contracts, metadata, full tests and native parity are required for any deployment.

## Reliability acceptance is separate

The32-case diagnostic is deliberately not labelled reliable. Six negative
controls per split cannot establish a low real-world false-acceptance rate.
Before a reliability claim, define the real deployment population, have reference
labels independently human-reviewed without predictions, collect representative
session/object-separated real-camera positives and hard negatives, report
per-kind precision/coverage/unknown errors with uncertainty, and pass physical
offline/permissions/latency/memory/energy/accessibility tests on matching binaries.
As a minimum statistical sample check, zero errors among59 independent examples
is needed even to put a one-sided95% binomial upper error bound below5%; this
does not establish representativeness or protect against distribution shift.
No quality severity or public-production NO-GO is lowered by unit tests alone.
