# Offline product integration protocol — 2026-11-15

Frozen before this integration run. This does not retake or replace previous
exact-SKU gate failures. The new UI accepts only a valid barcode/catalogue
mapping as a source assertion, not verified manufacturer data. Image+text can
only request confirmation. Automatic exact-SKU visual acceptance stays disabled.

- Same 17 source-labelled known queries and 41 safety/audit queries from the
  authenticated expanded allocation; never fitted or replaced after results.
- Add two explicitly generated EAN13 decoder fixtures: enrolled Nutella 400g and
  valid non-enrolled GTIN 1234567890128. These are not real-world accuracy data.
- Real current Swift native operation: full-frame EAN barcode; accurate OCR3
  (supported FI/SV/EN subset, no correction), full frame and fixed 0.1/0.1/0.8/0.8
  detail ROI; genuine full-frame MobileCLIP-S0 embedding only without barcode.
- One native operation per query, 12-second total native budget, 20-second
  process termination bound; never retry failed observations within this run.
  Exact original-byte SHA retained; crops are not independent samples.
- Native processes run with sandbox-exec deny network*. Validate that restriction
  using a failing controlled HTTPS probe. Actual app resolver/catalogue are
  bundled, and JavaScript fetch is also blocked in the test process.
- Freeze binary, app resolver bundle, catalogue, all relevant sources, query
  bytes, protocol and resource hashes before calls. Record raw outcomes including
  failures and timing/peak RSS, without changing thresholds or labels afterwards.
- Report known Top1/Recall5 ranking separately from barcode matches and image
  confirmation suggestions. Raw rank/cosine is not probability or acceptance.
  With only five enrolled SKUs, Recall5 is structurally uninformative.
- Report all denominators, wrong matches/suggestions, safety suggestions/accepts,
  failures, abstention, native/cold-process latency and maximum child RSS. Keep
  unresolved audit items separate from independently known absent products.
- Critical acceptance: no wrong barcode mapping, no safety automatic identity,
  both generated code outcomes correct, malformed data fails closed and no runtime
  network dependency. Quality: existing 14/17+all-five-pilots gate still required
  before automatic visual acceptance; do not call confirmation suggestions a pass.
- Independent 99% accepted precision/1% unknown false acceptance/70% known
  coverage cannot be established by this seen source corpus. Report confidence
  intervals only with their actual counts; no infinite precision from zero accepts.
