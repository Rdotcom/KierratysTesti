# QA accounting amendment — November7,2026, before held-out calls

Original protocol remains unchanged, SHA256
`976827d60f712b7a836b0c5f9881d10fb7add13952ea9e67f27ff26c67f3a295`.
This is a consequential disclosed adapter amendment, **not an unamended
preregistered pass**. No model, preprocessing, prompt, score, threshold, image,
reference label, normalizer or cascade condition changes.

The first seven-case validation run produces six baseline observations and one
baseline `{status:unavailable, reason:failed}`, exit1/no process error, wall15491ms.
The CLI failure envelope and four failure enums predate this experiment
(`scripts/qa/local-vision/main.swift`, native LocalVisionFailure and existing JS
recognizer). The QA evaluator incorrectly equates well-formedness with successful
observation and calls this defined failure malformed/invalid_response.

Recognize only exact two-key known failure envelopes with exit1 and no spawn
error as **well-formed expected failures**, not successful observations. Failed
maps to processing_failed/unknown, never no-match. This blocks supplementation
for the failed bottle exactly as before; its valid MobileCLIP bottle score is
not counted as a gain. All seven cases remain in the denominator and operational
success stays **6/7**, not7/7. Malformed/unknown/extra-key/crashed responses remain
invalid. No causal explanation for the processing failure is claimed.

Recalculate captured JSON only, into a fresh accounting artifact; no repeated
model calls. Preserve original null-selection summary, raw bytes and exact
evaluator snapshot/hash. Assert every per-policy decision and metric remains
unchanged: strict0, medium1, loose3 additional correct estimates; no new errors
or lost correct estimates. Only expected-failure well-formedness/eligibility
changes. Freeze amended adapter/source hashes and the selected policy before
any held-out call; the original executable's stricter accidental interpretation
is disclosed rather than silently overwritten.

An independent read-only code lane reviewed this interpretation against the
pre-existing CLI/native/JS failure contract. This is not human quality acceptance
or a production GO. Held-out criteria and all unknown/material/sorting safeguards
remain unchanged.
