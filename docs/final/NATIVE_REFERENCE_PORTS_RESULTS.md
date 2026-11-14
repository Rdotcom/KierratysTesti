# Native reference ports: synthetic integration results

2026-11-14. Experimental and not enabled in the normal app UI. This work adds
no dependency, model, account, cloud use or product-accuracy claim.

## Implemented

- Four fixed Expo methods: integrity/interface-only capability, bounded SHA256,
  full-frame embedding and oriented bounded RGB. No caller URI/model path,
  download, source identity, confidence, bin or product answer accepted.
- Existing verified 2024 MobileCLIP model/cache and CPU-only predictor are
  reused. Default coarse/OCR center-crop behavior remains. Full-frame uses
  aspect-fit gray127 and L2-normalized Float32 1×512 output, with stage deadline
  checks. New encoder identity is a versioned verified resource/interface
  descriptor, NOT executable attestation or the old Mac binary identity.
- All native operations share the existing single-flight worker. Timeout is
  delivery, not settlement; the gate remains held until synchronous work ends.
- Strict shared serialized contracts and mobile adapters reject wrong hashes,
  model/preprocessing, authority flags, extra fields, malformed vectors/RGB,
  unsupported platforms, legacy modules, oversized/shared/resizable inputs and
  late/aborted responses. No network, history, analytics or automatic GTIN/bin.
- Adapter capability is experimental only; `integrationAllowed` remains false.
  Android correctly remains unsupported for these new iOS ports.

## Failure retained and repaired

V1 completes the byte-bound runtime and synthetic candidate; its fit embedding
matches the old exporter exactly. It FAILS orientation 1: an extra UIKit-style
vertical transform puts the bottom corners in the RGB top row. No pass is
claimed for that run. Private evidence:
`work/native-reference-ports-2026-11-14.P5tYhw/smoke/` and canonical v1 ledger.

V1 protocol SHA256:
6ef9ec674e74fb4951f7f324f4474b2ba8c5aa855bb5b8d86c63f9a7fdcda1f1.
V1 result SHA256:
0e8f4e85e8de2e7440bfd61bdd384cf7ef25ffc288bc714cc8682b32903988cb.

Remove that transform, add eight actual generated-JPEG native orientation
regressions, and register a separate v2 protocol/ledger with the same input
hashes, budgets and unchanged tolerances. V1 raw outputs/binary remain; no reset.

Initial mobile typecheck also rejects Node-only crypto/Buffer in a unit-test
fixture. Replace that fixture with a labelled noncryptographic port double and
portable codec; actual SHA is checked in native tests. Full validation initially
rejects the stale two-method native-bridge allowlist; expand it to exactly six
methods and add policy tests, keeping the resource-path prohibition intact.
No package, tsconfig weakening, warning suppression or gate relaxation is used.

## V2 passes

Private evidence: `work/native-reference-ports-2026-11-14.P5tYhw/smoke-v2/`.
Canonical ledger: `work/native-reference-port-smoke-v2-attempt.json`.
Protocol SHA256:
f7bbc0e8e1f36b2b3965438eac343c063d4eb7c6e10784dc641c6e1233bf9550.
Result SHA256:
ba8339a136a982b840fe3db23336311c46c43f0e9a26279936b88c0edf30a039.

- 146 pinned source/test/protocol/dependency files; generated inputs exactly
  match v1. Original exporter/model and 58-artifact decoder checks pass.
- Actual mobile adapter + public shared runtime compilation, inferred synthetic
  query candidate, vector/source/image joins and training-copy rejection pass.
- 34 bounded processes: one capability, 17 real native SHA calls, four native
  full-frame encodes, eleven RGB decodes and one old two-view exporter process.
  Four new predictions are derived from the exact shipping call path; the old
  exporter reports two predictions. Six loads are derived from separate fresh
  processes, not new instrumentation or physical-device performance counters.
- Query full-frame vector parity: max absolute difference **0**, cosine
  **0.9999999999999993**. Encoder IDs stay distinct despite numerical parity.
- All eight EXIF orientations have expected dimensions, original-byte hashes,
  RGB sizes and four asymmetric corner colours under the original tolerance.
- Separate zero-new-call source recount reports 146/146 unchanged. This is
  same-agent engineering verification, not an independent human review.

## Software/native evidence and limits

Five new shared contract, nine mobile adapter and two Node policy tests pass.
Shared scoped validation passes 585 overlapping tests; mobile scoped validation
passes 914. Twelve native lifecycle/hash/input checks and eight actual generated
JPEG orientation regressions pass without model predictions. Existing readiness,
recognition, malformed-input and cascade native checks also pass (8/9/8/6).

Swift 6 warnings-as-errors compilation passes on macOS. Shipping predictor and
engine compile as an arm64 iOS17.2 module against the actual iPhoneOS SDK without
QA hooks. This alone is NOT a complete Expo bridge/app or signed release build.
Full repository validation/build status and any subsequent full iOS build are
recorded in TEST_EVIDENCE and CURRENT_STATE, not inferred from this module check.

The subsequent full SDK58 **unsigned Release app build11 succeeds**, including
all three shipping Swift files and the actual Expo bridge. Embedded Hermes99
bytecode is present; app73MiB. All six fixed bridge names and four exact notices
are present, QA symbols absent; bundled graph/weights match expected pins.
Receipt SHA256:97bd57ca568fcf40bf33c2f6c1d5ed1aa1f9262339fb1f9ddc0aa7dfd94027b0,
private `work/native-reference-ports-2026-11-14.P5tYhw/release-build-receipt.json`.
Log:`/tmp/kig-native-reference-ios-release-20261114.log`.
First build emits1103warning lines (mostly repeated dependency diagnostics),
including one existing Swift5readiness function-to-Sendable conversion warning.
Do not call this warning-free, a signed archive, store or physical acceptance.

Binary SHA256:17474b0681b489eba9cdd2ae18ecf3ee24f0ef06617dc20178b0dfd66d65e7f1.
Hermes SHA256:44d80af7b83fe5b15b4607e0eb6035a14f53411b8c24ff1b736358d3533e54b2.
The old generated iOS files were archived before Expo regenerated them; Pods
were reinstalled, incidental package-script changes restored. This is source11,
not a new version bump, installation, signing/account operation or publication.

All actual images here are generated textures/quadrants. There is no prospective
product, camera, warm iPhone cache, latency, battery, permission, VoiceOver,
Android or store acceptance. The earlier seven Barilla-source agreements are
unchanged cached development data, not generalized accuracy. The owner waives
a separate human checker (D-086); source identities remain source-asserted.
Native bridge/app verification and a newly frozen broader source-image/camera
evaluation remain necessary before enabling this experimental runtime.
