# Packaging classifier comparison protocol — frozen November7,2026

Freeze before any MobileCLIP picture inference on the packaging candidate corpus.
Text embeddings and non-picture interface/tokenizer checks may be prepared first.
This is a local engineering comparison, not general accuracy, human reference
acceptance, true-material/SKU/safety or physical-camera certification.

## Candidate and baseline

- Baseline A: exact deployed V3 Apple Vision7-label operating-point policy,
  OCR policy and normalizer. No class thresholds, source labels or images change.
- Candidate: pinned2024 Apple MobileCLIP-S0 Core ML image/text artifacts under
  that artifact's retained ASCL notice, not a newer research-only checkpoint.
  Text prompts are fixed ASCII in the committed prompt specification before
  picture calls. Five visible-form groups and13 outside-kind groups. Normalize
  each text embedding, average within its group and normalize again; cosine
  against normalized image embeddings. No probabilities or material claims.
- Evaluate a conservative cascade: an already accepted baseline estimate stays;
  baseline conflicting-kinds remains uncertain; only baseline no-match may use
  the supplemental model. Negative-group winner, weak cosine or insufficient
  lead yields unknown. Raw scores/actual model/source hashes are retained.
- Candidate picture preprocessing follows the official pinned S0 implementation;
  same preparation must be used in eventual native app code. No filename,
  expected label, GTIN, URL or split reaches a model—only validated image bytes.

## Preregistered gate selection (validation only)

Exactly three policies, tried in this conservative-first order:

| Policy | Minimum winning cosine | Minimum lead over every other positive or negative group |
| --- | --- | --- |
|strict |0.30 |0.030 |
|medium |0.25 |0.025 |
|loose |0.20 |0.020 |

These are provisional engineering rejection gates, **not calibrated confidence
percentages**. Select the first policy that introduces no new wrong/unsupported
accepted kind on validation, retains every correct baseline estimate and adds
at least two correct positive visible-form estimates. Never search additional
prompts/thresholds or pick a policy based on held-out results. If none passes,
retain the current app default and preserve the failed candidate.

Freeze the chosen gate and all artifact/source/input hashes before the first
held-out picture call. Each model runs once per eligible case, with explicit
attempt markers and every result/failure retained. Retry only a documented
preflight failure before a picture call, not a disappointing model response.

## Held-out engineering integration gate

- No new wrong or outside-kind acceptance; retain all correct baseline estimates.
- At least one additional correct positive estimate beyond baseline on held-out,
  and at least three additional across validation+held-out.
- Every raw/normalized output validates and no result gains brand, true material,
  hidden part, deposit, empty/clean/hazard verdict or sorting destination.
- App-bound image model+prototypes+notices stay below30MB; no runtime network,
  text-model download, service key or paid fallback. Native compile/resource/
  malformed-input/lifecycle/privacy tests remain mandatory before integration is
  declared implemented. Phone/memory/battery acceptance is still separate.

If this finite engineering gate fails, do not ship the candidate as the default.
Record failures and continue locally executable model/data work rather than
relabel them as external funding blockers or reduce severity to obtain GO.

## Data and provenance

Use the new packaging-only manifest frozen after source/licence/privacy/pixel
review and before inference. All labels remain AI-reviewed/human-review-required.
Previously evaluated eight/nine pictures may appear only as explicitly seen
training/development cases, never newly held-out. No weights are trained in this
zero-shot comparison. Training/validation/held-out object/source groups do not
overlap. Source-declared licences, authors, exact URLs, bytes, hashes, exclusions
and any incompleteness are recorded. Exclude unsuitable photos before any call;
no replacements after inspecting model results. Pretraining membership unknown.

No phone installation/renewal, user-photo reuse, paid call, cleanup or GitHub
publication is authorized by this comparison. Full/part validation and honest
quality/production NO-GO documentation remain mandatory.
