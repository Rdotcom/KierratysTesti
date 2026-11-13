# Master prompt — local hybrid product recognition

Owner authority: Roope approved the hybrid on November 13, 2026 and requested
this prompt and its implementation. This is local engineering authority, not
permission for paid inference, GitHub publication or a production release.

## Mission

Continue from the actual repository and its applicable AGENTS.md. Combine the
existing pinned, free on-device MobileCLIP image encoder with our original
reference matcher and self-confusion quarantine. The encoder is pretrained;
our retrieval, conflict handling and safety policy are our implementation. Never
describe this as a model trained entirely by us. Keep barcode/OCR, packaging
observations and sourced sorting rules separate from visual identity inference.

Read CURRENT_STATE, NEXT_ACTION, ROADMAP, DECISIONS, EXTERNAL_BLOCKERS and
ACCEPTANCE_CRITERIA; inspect status/history before edits. Preserve teammates'
features and the current UI. Do not import new KeepItGreen code or experiment
history. Do not modify old frozen experiments or erase unsuccessful results.

## Ordered execution

1. Implement a bounded, pure experimental embedding index: exact encoder and
   preprocessing identity, 512 finite nonzero coordinates, at most 32 references,
   per-product rather than per-image competitors, explicit registered cosine and
   margin gates, deterministic ties, self-query exclusion and source receipts.
   Test malformed/hostile/oversized input, numeric stability, model drift, ties,
   duplicate references, abstention and provenance. No image/model call is
   needed for these software tests; synthetic vectors prove arithmetic only.
2. Bind actual source bytes and reference vectors to the existing pinned encoder
   and preprocessing through trusted platform ports. Verify actual resource and
   input hashes, exclude independent queries from enrollment, retain deadlines,
   cancellation/single-flight and missing-model failures. Do not accept caller
   metadata as proof that image bytes were encoded. Keep this off the app path.
3. Freeze one development comparison before any new image predictions: sources,
   original-parent groups, encoder/decoder/source hashes, splits, fixed gates,
   stage budget, baseline and required metrics. Compare pixel-only, embedding-only
   and a registered hybrid. Preserve all failures and prior known controls.
   Existing OFF images are seen community-labelled development references, not
   independently verified identities or a held-out release test. Freeze a new
   prospective test separately; never tune against it after results.
4. Implement/test fusion only under that registered policy. Conflicting identities,
   near-identical sizes and known-confusable families must remain ambiguous.
   A coarse object class is not a SKU. Unknown, inference error, timeout and
   insufficient evidence are separate results. Similarity is not a probability.
5. Measure useful coverage AND incorrect accepts, losses, unknown/mixed/hazard
   controls, runtime/memory and dependency/bundle effects. Never qualify an
   always-abstaining recognizer or hide missing classes in the denominator.
6. Only after demonstrated quality and independently reviewed identity/rights
   evidence, integrate behind an explicit capability gate. Preserve FI/EN,
   retake/manual/barcode recovery, material Check+Confirm, full sorting provenance,
   accessibility and local deletion. No automatic material/bin/record from a
   product image; no raw-photo analytics, cloud fallback or service secret.
7. Run narrow regressions while repairing, validate:shared/mobile as relevant and
   full pnpm validate. Native compilation, actual device offline/camera/permissions/
   accessibility/latency/battery and Android acceptance are separate gates. Do not
   claim them from unit tests, browser screenshots or unsigned builds.

## Stop conditions and reporting

Continue locally executable engineering. Ask only for genuinely new owner
authority, human adjudication, physical actions, accounts, secrets or payment.
Never fabricate human labels/review/licence approval. Retain existing NO-GO until
all release gates are met. No push, production deployment, phone installation,
cleanup or paid call is implicitly authorized by this prompt.

After each coherent unit, update CURRENT_STATE, append DECISIONS, update ROADMAP,
record validation and genuine external blockers, and leave exactly one concrete
NEXT_ACTION. Create a reviewed local commit when checks pass. Report what was
actually implemented, measured, untested and next, not a release-ready promise.
