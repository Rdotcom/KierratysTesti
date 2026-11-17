# Foreground-subject experiment — November8,2026, before mask inference

Separate experiment after A/B and S2 failed. Preserve their original scores,
labels, null/locked choices, operational failures and failed integration gates.
No from-scratch foundation model, paid service, user photo, account, phone action,
publication or automatic sorting is authorized. No score is factual confidence.

## Fixed observation pipeline

Use Apple Vision `VNGenerateForegroundInstanceMaskRequest`, revision1, default
system compute policy, on the existing EXIF-oriented/origin-normalized image.
An observed subject can combine multiple physical objects; neither its count nor
its absence proves how many real objects exist. No person-specific request.
Require one observation with1...4 foreground subject indices; never truncate an
excess. Validate actual mask pixel format/stride/bounds/finite integer labels,
background0 and observed labels matching reported indices. Extract each selected
subject using the system's cropped masked-image operation, composite alpha on
RGB127/127/127, aspect-fit256² sRGB, and classify using the unchanged pinned2024
MobileCLIP-S0 encoder/prototypes/loose cosine0.20/lead0.020 gate.

The model's instances, crop dimensions, actual mask encoding/indices, compute
policies, OS/revision, all18 scores per subject, stage counters and failures are
explicit. No adaptive class prompt, threshold search, filename/expected label
input, score averaging or inferred material/SKU/hazard/deposit/bin.
Use one logical12s budget covering asset load, decode, mask, extraction and
classification; cancellation is best effort. Never declare a late return an
on-time success; process watchdogs must retain raw failure/counter uncertainty.
Missing/too-many/invalid subjects or required stage failures are unknown plus
stage failure, never successful error removals or safe policy abstentions.

## Exactly two original decision algorithms

- **F1:** for an accepted baseline form, veto to unknown if at least two confident
  supported subject kinds differ and the baseline kind is among them. Otherwise
  retain the baseline. Never substitute. Already-unknown baseline stays unknown.
- **F2:** apply F1 to accepted results. Additionally, recover a form only when
  primary processing succeeded with a true primary no-match, center processing
  succeeded, and the baseline unknown reason is weak_similarity or
  ambiguous_similarity. Every detected subject must independently pass the loose
  positive gate with the same kind. Never override a primary error/conflict,
  unsupported/outside winner, invalid response or model failure.

Required mask failure yields unknown/foreground_unavailable and remains an
operational failure. Unused failures on cases ineligible for either algorithm
are recorded but do not erase the primary/OCR observation or become a new
required-stage failure. Recovery is still inferred, not verified product data.

## Explicit interface probe before pictures

Compile and run no-prediction geometry/mask-layout/input selfchecks first. Allow
exactly one owned in-memory uniformRGB512² interface probe: one foreground
request, no text/person/private data, no CLIP predictions. Zero subjects is a
normal probe outcome, not a quality result. Record cold timing, format/stride
when available, counters and every failure. A runtime unsupported/failed/timed-out
probe stops picture calls; do not retry it or conceal cold cost as warmed latency.
This is not a benchmark or proof of field/offline availability on every phone.

## Seen development, with old failures intact

Use52 already-seen cases: original validation16, original held-out16 and failed
S2 prospective20. The old held-out/prospective sets are explicitly development
data now, **never called fresh again**. Reuse their exact captured primary/center
outputs; no retake. Baseline21 correct accepted of30 positive forms, five wrong
control acceptances of22 controls, two primary operational failures including one
invalid45s process-timeout output. Keep all52 denominators and original failures.

Reference receipts:

- validation SHA256 `fd86f9bad85d03775cfddab5edc2c79d88206f1e10ec5617defb9bb17c977ea2`;
- original held-out `9080c48969e3dce0713f17bcab6504ff5fa071a93d08024307779af3911cba89`;
- failed S2 prospective `24aab017de4e11eded7484ac886c4f1ae410c5f73350f5a259bafe159b037e60`.

Run mask/extraction/subject classification once for each of50 successfully
processed primary cases; skip the two failed/invalid primaries but retain them
as failures. At most200 subject CLIP predictions, actual counts retained. No
retry/replacement after outcomes. Both F choices may use only these seen cases.
Eligibility: remove at least one baseline wrong acceptance, introduce no wrong
acceptance, lose zero baseline-correct positives, and introduce no required
operational/invalid stage failure. Existing baseline failures are not repaired by
offline re-accounting or excluded. Prefer most errors removed, then most correct
accepted positives; F1 wins ties as the smaller behavior change. Freeze one
qualifying choice and exact source/binary/model/reference hashes before new data
predictions. If none qualifies, do not deploy or test a loser prospectively.

## Separate new prospective confirmation

Freeze20 genuinely new rights/privacy/group/byte-traced public references:
ten positive forms (two per kind), ten outside/mixed controls including at least
five clear multi-supported-kind scenes. Exclude every previous acquired/evaluated/
rejected/reserved source/object family. At most40 candidates/25MB; visual review
before predictions, AI-reviewed/human-review-required, pretraining membership
unknown. Report a genuine data shortfall, never weaken labels to hit a quota.

For this phase use the repaired bounded primary QA binary with an explicitly
empty QA resource directory, so its actual V4 observation contains primary/OCR
and honestly reports a skipped supplement on primary match/conflict or unavailable
supplement on no-match; center is executed separately once. Do not
fake V3 metadata. Pin its binary, engine and QA source before calls. Classification,
OCR and operating points remain unchanged; a typed exact timeout envelope is a
well-formed operational failure, never no-match. This operational repair does
not change or retake the old development failures.

Run primary/center once per new case, then foreground once only where the locked
algorithm requires it. All20 remain in denominators. No policy choice, label
change or retake from this set. Integration requires zero wrong/outside/newly
wrong acceptances, zero baseline-correct losses, no introduced required
operational/schema failure, at least five correct positive acceptances and at
least one wrong removed if baseline makes any. Otherwise retain the failed
candidate, do not deploy it or lower severity. Passing is finite engineering
evidence, not independent human/representative field acceptance.

Any app integration additionally requires strict native/legacy/source contracts,
timely failure/cleanup, exact QA/native parity, full validation, compiled-resource
checks and separately requested signed-device tests. Real camera, cold/warm
latency, memory/energy, accessibility, Android and production gates remain open.
