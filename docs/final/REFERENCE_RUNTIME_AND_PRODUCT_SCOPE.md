# Reference runtime and first product scope — November 13, 2026

## Outcome

The own pixel matcher now has an experimental **encoded image → named inferred
candidate** runtime, not just a function accepting arbitrary descriptor objects.
It is not enabled in the app. Product quality and public release remain NO-GO.

The compiler independently imports complete asserted metadata, snapshots the
exact byte set, hashes each encoded source, invokes a trusted bounded RGB
decoder, extracts our V2 features and compares a canonical feature SHA256 with
the receipt. Every enrollment and independent-query reference is bound; only
enrollment references enter the closed matching gallery. Missing/extra/swapped
assets, partial binding, changed hashes, unsupported versions and failed ports
cannot return a usable partial runtime.

Limits: 32 references, 2 MiB per encoded image, 16 MiB aggregate, 1024×1024
decoded maximum, serial compile/identify without a work queue. Owned source and
port copies are cleared on settlement; this is not cryptographic memory erasure.
Trusted ports can stall: this pure module does not promise native cancellation
or a wall-clock deadline. Unknown/ambiguity and unavailability remain distinct.

Successful candidates retain the reference, rights, feature receipt, catalogue
acceptance, identity review and inferred/uncalibrated explanation. An optional
GTIN is explicitly **reviewer-asserted**, not image-verified. No material, bin,
automatic product lookup or recycling record is generated. The query hash is
potentially sensitive correlation data; future consumers must not log/persist
it by default. The runtime itself does no I/O, upload, analytics or storage.

`integrationAllowed` is always false. Byte integrity does not authenticate human
reviews, prove true identity, satisfy licensing or establish camera quality.
There is no app/backend consumer or default catalogue. Existing material
confirmation and sourced sorting rules are unchanged; installed client10 and
source iOS11/Android3 are unchanged by this unit.

## Real initial product choice

Roope delegated selection. Five keyless official Open Food Facts responses select
Nutella 400 g, Nutella 750 g, Coca-Cola Original 330 ml, Barilla Spaghetti Nº5
500 g and LU Prince 300 g. Two similar Nutella sizes deliberately expose exact-
SKU confusion; shared graphics must produce uncertainty, not a guessed size.
Source-reported names/sizes do not establish Finnish variant identity/materials.

The committed source-selection JSON retains response hashes, URLs, contributor
credits, dates and 21 proposed original front-image upload IDs. Languages/crops
collapse to their original `imgid`. Distinct uploads are not automatically
independent captures. All identity/rights/privacy reviews remain pending and
splits unassigned. No external image was downloaded or inferred on. See
`docs/research/reference-product-selection-2026-11-13.md` for primary sources and
the denied terms/wiki access, which was not bypassed.

The catalogue importer explicitly supports CC BY-SA 3.0 with a canonical licence
URL, modification notice and same-licence redistribution field. It never maps SA
to BY. ODbL selection data is separate from code; rights acceptance remains an
assertion, not legal clearance or permission to publish images/descriptors.

## Validation and retained failures

Evidence directory: `work/reference-release-2026-11-13.KaWEKa/` (ignored/private).

- 72 narrow domain tests pass: 50 catalogue + 22 runtime. New shared tests use a
  deliberately non-cryptographic port double, not a claim to validate SHA256.
  Nine new Node cases cover selection/API bounds and real Node SHA256/decoder
  orchestration; existing tests remain unchanged.
- Full `pnpm validate`: **1507 unique tests** (626 Node + 881 workspace),
  boundary/format/lint/types and all builds including 18 web routes pass.
  `pnpm validate:shared` passes **485 overlapping tests**. Frozen install passes
  with no manifest/lockfile or supply-chain-policy change.
- Live security policy passes: zero high/critical, 23 lower advisory records
  remain (17 moderate, 6 low). The previously observed online Expo recommendation
  failure is not fixed or waived: 12 patch updates remain local maintenance
  before a matching native audio build; the latest observed core is 58.0.25.
- First typecheck fails on array descriptor typing. The repaired code reads the
  native length descriptor and checks the cap before enumerating descriptors.
  First full validation fails because a test imported `node:crypto` into shared.
  Keep the platform boundary unchanged: use a fixture port double in shared and
  the actual Node adapter outside shared. Original logs remain; final checks pass.

### Actual encoded-byte adapter smoke

`runtime-byte-smoke.mjs` verifies the 58 already-installed Sharp decoder artifact
hashes, freezes 28 source files, bundles the public experimental entry and uses
real Node SHA256 plus real PNG decode. It generates three original synthetic
texture PNG encodings **in memory**. Fake accepted/capture metadata is clearly a
synthetic test fixture, not real independent evidence. No grocery image, old
corpus, model, API, training or user photo is processed.

One run passes: **3 PNG encodes, 8 actual decodes, 14 runtime SHA256 calls**;
2 enrollment references/1 bound query. Enrollment texture returns an inferred
candidate; the query-only texture returns unknown. All 58 decoder artifacts,
the source set and compiled engine hash are unchanged after calls. This proves
the byte/decoder/feature/receipt wiring, not recognition accuracy or JPEG/native
camera behavior. Node JPEG/PNG signature/format/frame/dimension/RGB guards have
synthetic regressions; actual encoded smoke uses PNG only.

| Artifact | SHA256 |
| --- | --- |
| Committed source-selection JSON | `904d38041e528dfaff897ebcef3f8bd5436411a7b1d138cd561bb9d397170ef8` |
| Smoke source/decoder lock | `e3cddb76fea42dcc694b025fd81809d8fc34dec72b56b0ee8bc30c5cc053b376` |
| Smoke compiled public engine | `9395c811eb8331e8c9e12d4ed5ce7bbee264455a1430028420046fb9b79bec7a` |
| Smoke summary | `3c0dff6ad2b962c3305271b13311898ae5e54a7d54f0c150d63d0161398d0289` |

The smoke's actual result is in `byte-smoke/summary.json`; no repeat or old
experiment-ledger modification is needed. This is an engineering fixture, not
another held-out quality experiment. No browser visual QA was needed because no
UI changed; no new native build, device, offline-camera, accessibility, latency,
memory, battery, Android, remote-CI or store evidence is claimed.

## Remaining release gates and owners

- **Engineering/Codex:** implement bounded acquisition/review-packet tooling for
  the selected source uploads. Preserve attribution, byte hashes and duplicate
  lineage; never fabricate capture dates/reviews or auto-assign independent
  splits. This is locally executable, not an account/payment blocker.
- **Roope, reference-review organizer:** arrange actual identity/barcode,
  rights/privacy and independent-capture review. Obtain separate real query
  captures and similar/unlisted/mixed/occluded controls. Source catalogue labels
  and AI-generated reviews cannot substitute for that acceptance.
- **Engineering/Codex:** freeze and run a representative acceptance protocol,
  diagnose failures without retuning the held-out set, and implement a matching
  native RGB adapter with deadlines, parity, privacy and platform tests. The
  Node reference adapter is not a phone implementation.
- **Roope, device/release owner:** operate actual physical prompts/camera and
  accept representative offline/permission/VoiceOver/performance/energy behavior
  after a separately requested matching installation. Complete existing
  privacy/operations/store gates before public publication.

No source is pushed, no phone is installed/renewed, no private key is read, no
paid request is sent and no user data is deleted. New source is locally committed
only after validation. Existing LV-001/PHOTO severities and NO-GO remain.
