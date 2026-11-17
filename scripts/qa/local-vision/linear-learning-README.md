# One bounded local learned-head experiment

Read `scripts/qa/protocols/local-vision-linear-protocol.md` and the fixed
`linear-learning-spec.json` before running. This learns an original small
six-output ridge head on18 captured pretrained-image similarities, not a vision
foundation model, exact product identity, material truth or sorting policy.
It uses45 training and27 validation references from72 already-seen AI-labelled
pictures. Validation is a development gate, never independent field accuracy.

No image model, external API, network, package installation or private photo is
needed. Existing licensed source images, captured raw receipts, compiled model
resource hashes and installed pinned dependencies must remain available. Data
loading validates them locally without rerunning image recognition. Do not
change source/reference/model files, parameters, family split or seed from results.

## Freeze without learning

Choose a fresh existing parent inside ignored `work/`. For example, create
`work/linear-learning-v1` only if it is absent, then:

```sh
node scripts/qa/local-vision/linear-evaluate.mjs --freeze \
  --output work/linear-learning-v1/freeze
```

The output contains the exact lock SHA256, source/runtime/data proof and complete
45/27 family-bound allocation. This command fits and predicts nothing. Source
and data drift, existing output paths or an already claimed experiment fail
closed. Opaque image hashes determine arithmetic order; references determine
the class/unknown strata, never outcome-based allocation or answer-bearing IDs.

## Fit exactly once

Use the actual64hex lock hash printed by freeze, not a made-up value:

```sh
node scripts/qa/local-vision/linear-evaluate.mjs --run \
  --lock work/linear-learning-v1/freeze/lock.json \
  --lock-sha ACTUAL_LOCK_SHA256 \
  --output work/linear-learning-v1/result
```

The canonical `work/linear-learning-attempts/kig-linear-v1.json` exclusive ledger
prevents a second fit using another output, copied lock or another freeze in this
workspace. Never delete/reset it, retry a failed fit, or present deliberate edits/
another checkout as tamper-proof independent replication. Per-lock markers are
ancillary. Preserve all partial outputs and explicit counters.

One45-row fit uses training-only statistics, six class-balanced losses summed
without division by6, L2=1 and a jointly solved unpenalized intercept. Serialized
model membership/counts/means/scales, objective/norm/residual are independently
checked before72 head predictions. |z|>8 rejects extrapolation; unique rawmargin
≥0.10 is not a probability. Only an already-accepted matching baseline kind can
be retained. Existing unknown/conflict/error stays unknown; required head failure
is a failure, never successful error removal.
Fit sanity separately evaluates45 training-row forward residuals; these are
numerical checks, not additional independent recognition samples or model calls.

`model.json`, `fit-sanity.json`, `summary.json`, attempt/lock source evidence and
any failure receipt remain under ignored work. No learned artifact is copied into
the app or claimed human-reviewed. Report train/validation/combined metrics
separately and preserve both original primary failures. A failed gate stops this
protocol; do not tune or repeat it. A pass still needs independent labels, fresh
representative camera evidence and a new native/contract/resource/readiness/
deadline integration, because production currently skips CLIP on primary matches.

## Checks

```sh
node --test scripts/__tests__/linear-head.test.mjs scripts/__tests__/linear-data.test.mjs scripts/__tests__/linear-evaluation.test.mjs
pnpm validate
```

Synthetic fixture fits are numerical/contract tests, not real-data model training
or recognition-quality samples. Existing installedtsx4.21 loads only public shared
contracts in the real data adapter. No dependency version is installed or changed.
