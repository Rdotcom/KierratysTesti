# One frozen two-view local learning experiment

Read `scripts/qa/protocols/local-vision-two-view-protocol.md` and the closed
`embedding-learning-spec.json` before running. This is a distinct experiment
informed by the failed18-feature head, not an independent validation or clean
feature-only ablation. It changes image information, normalization and ridge
regularization together. All72 original public licensed images are already
seen/AI-reviewed; both independent human forms remain blank.

No new checkpoint, network, paid API, package install, user photo, signing,
phone install or app integration occurs. The pinned cached2024 image encoder
and the fixed standalone exporter must already exist at their registered paths.
No labels/IDs/metadata are passed as encoder input. Features are image-form
estimates, not verified product identity, material, safety or sorting.

## Freeze before predictions

Choose a new existing private parent under ignored `work/`. Then run the
explicit freeze mode with a nonexistent output subdirectory:

```sh
node scripts/qa/local-vision/embedding-evaluate.mjs --freeze \
  --output work/ACTUAL_NEW_PARENT/freeze
```

It verifies existing source/data/binary/runtime and identical45/27 family-bound
allocation without image prediction or fitting. Retain the printed lock SHA256.
Do not change any captured source/specification/data/model after freezing.

## Acquire once, preserving every planned case

```sh
node scripts/qa/local-vision/embedding-evaluate.mjs --acquire \
  --lock work/ACTUAL_NEW_PARENT/freeze/lock.json \
  --lock-sha ACTUAL_LOCK_SHA256 \
  --output work/ACTUAL_NEW_PARENT/acquisition
```

Maximum72 processes and144 explicit image predictions: current center crop and
full-frame aspect-fit,512 dimensions each. Each pair must preserve all18 center
cosines exactly;16 existing full-frame references additionally require exact
parity. Both unit views are mandatory; partial/failed pairs never become feature
rows. A12s logical budget,15s parent timeout/SIGTERM and bounded output are not
a guarantee of forced native cancellation or battery performance.

One failed required pair stops remaining acquisition and prevents fitting. The
summary still includes all72 planned cases, failed/not-attempted counts, exact
or lower-bound/unknown model counters, raw stdout/stderr and source/attempt
receipts. A failed summary must not be supplied to the fit mode. Zero known
completed calls with unavailable telemetry does not certify zero actual work.

The canonical `work/embedding-learning-attempts/kig-embedding-v2-images.json`
claim prevents another acquisition via a copied lock/new output/new freeze.
Do not reset/delete it, retry failed pictures or modify equality tolerances to
hide drift. Local owner edits/another checkout are not tamper-proof replication.

## Fit once only after complete acquisition

Only a complete status with72 observed pairs/144 completed predictions and
unchanged source/data qualifies. Retain its printed summary SHA256:

```sh
node scripts/qa/local-vision/embedding-evaluate.mjs --run \
  --lock work/ACTUAL_NEW_PARENT/freeze/lock.json \
  --lock-sha ACTUAL_LOCK_SHA256 \
  --features work/ACTUAL_NEW_PARENT/acquisition/summary.json \
  --features-sha ACTUAL_ACQUISITION_SUMMARY_SHA256 \
  --output work/ACTUAL_NEW_PARENT/result
```

Before claiming the fit, the runner rechecks every saved raw pair, attempt,
matrix value, exact reference parity, source/data and canonical image claim.
This rereads outputs, not images through a model. The separate canonical
`kig-embedding-v2-fit.json` claim binds that image-stage lock and permits one
fit only, never image reacquisition.

The original deterministic dual-ridge head uses raw1024 unit features formed
only by `concat(center,fit)/sqrt(2)`, inverse-class-count SUM weights, joint
unpenalized intercept, λ0.1 and rawmargin0.1. Serialize coefficients, not training
examples. One45-row fit internally checks45 forward residuals; an independent
plain-primal checker separately checks45 more. These90 numerical rows are not
accuracy samples. Record72 learned decisions separately from144 image calls.

Only matching already-accepted baseline kinds may survive. Unknown/conflict/
primary failure cannot be recovered. Required missing/invalid head work is a
failure, not safe abstention or successful error removal. Preserve source/
jurisdiction/date/version/verification/confidence/explanation in the actual app;
this QA experiment neither changes those domains nor produces a sorting answer.

## Stop and interpret honestly

Report train45/validation27/combined72 and both original primary failures.
The frozen gate demands zero validation wrongs/correct losses/new wrongs/new
required failures/invalid outputs, removal of at least one valid old wrong,
at least8 correct positives and one per supported kind. Keep a failed result;
do not tune λ/margin/split/seed or rerun. A development pass still cannot deploy
this model: independent human adjudication, representative native-camera and
versioned runtime/readiness/resource/contract/latency/energy/platform evidence
remain required. Current production skips CLIP for primary matches.

## No-image checks

```sh
node --test scripts/__tests__/embedding-*.test.mjs
pnpm validate
```

These use synthetic numerical/contract fixtures or read existing receipts.
They perform no real image predictions or actual-data fitting. The exporter
also has separately evidenced no-image numeric/geometry/invalid-byte tests and
a model-load-only preflight; neither is a camera-quality pass.
