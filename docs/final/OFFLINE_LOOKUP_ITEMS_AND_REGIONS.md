# Barcode recovery, item search and local guidance — November16

## Owner-reported visibility repair — client17

Owner16confirms remote/cutlery search and actual on-device HSY area selection,
but correctly reports that an answer below the initial viewport looks like no
response. Earlier functional/browser overflow checks did not cover this.
emil-design-eng informed this focused correction:

| Before | After | Why |
| --- | --- | --- |
| Filters and area panel precede the answer | Result directly after search; area controls below | Reveal the outcome immediately |
| Repeated introduction/hint/filters during a specific query | Hide those extras while query is present | Keep first-viewport space for the answer |
| Search submit can leave old scroll position | Instant scroll-to-top, dismiss keyboard, announce result count | No search-triggered animation/delay |
| Packaging caution/Rinki footer also follows remote answer | Show packaging-only footer only with material guides | Do not imply wrong source or irrelevant bottle instructions |

Actual guide FI/EN/light/dark/390and320px browser cases now assert heading and
instruction start in first viewport, result preceding region controls, no
overflow and44pxcontrols. Owner17“nyt näkyy hyvin!” confirms remote instruction
is visible without scrolling on the physical phone. This is not general
VoiceOver/large-text/Android or native network-fallback validation.

## What was wrong and what changed

The configured development API was unreachable (`/health`:connection refused),
not evidence that the phone had no internet. Barcode lookup now tries the
existing five-product catalogue without network/model work, then the existing
API. Only a transport failure permits one direct public Open Food Facts food
lookup. A real backend404is preserved. Both transports failing retains pending
recovery, with a service-unreachable message rather than asserting phone offline.

Public adapter: fixed HTTPS/allowlisted identity fields, omitted credentials,
no redirects/photos/location, six-second timeout, four calls/minute,65536byte
declared AND streamed cap, validated GTIN/aliases/product type/text/protocol.
404/unavailable/malformed remain distinct; identity is community/unverified
packaging, never a bin guessed from a brand. OFF attribution/ODbL+DbCL retained;
privacy copy explains the direct fallback and service visibility of connection IP.
No new permanent cache/photo/history data is added beyond existing lookup history.
Unbundled products still need internet; this is NOT a full offline product DB.

Guide search now finds23reviewed object categories/aliases, including remote
controls, appliances and cutlery, and shares the actual camera-choice policy.
No fabricated AI observation is constructed for text search. Remote→WEEE plus
battery instructions; spoon→material→direct small-metal cutlery instruction.
Unknowns and unsupported materials remain unknown. Model/encoder/barcode
decoding/contracts and all previous quality failures remain unchanged.

Offline official2026municipal polygons resolve requested location and select
HSY/LSJH/Kiertokaari policy (32municipalities); all308towns are selectable, NOT
all308reviewed. Regional ceramic/glass/plastic rules differ; textiles HSY-only.
No HSY default for Tampere/other unsupported areas. Coarse/coastal/border fixes
need confirmation; raw GPS never goes to a service/storage/log/history. Location
request is explicit, one-shot, cancellable; background clears selected town and
stale results cannot restore it. Nearby's existing accepted fix also selects area.
Source/checked date/version/jurisdiction/verification/explanation/user-choice
confidence are preserved. Larger metal receptions are named operator examples,
not an invented nearest facility. Research/licences/HSY account procedure:
`docs/research/offline-lookup-items-and-regions-2026-11-16.md`.

## Verification

- Unit/contract coverage: offline5product hit/alias/miss/no-network, backend404/
  fallback/recovery; fixed endpoint, bounded responses/text/time/rate, source
  attribution/no inferred packaging; remote/object aliases/unknowns, municipal
  containment/coastal refusal/unsupported municipality and regional differences.
- `public-identity-smoke.mjs`: exactly one public GET for5449000000996→HTTP200,
  Coca-Cola Original, `packaging_missing`, community provenance, ODbL/DbCL;
  no photos/private scan/secret/paid request. This is a Mac HTTP smoke, NOT native
  camera, airplane-mode or Samsung proof.
- Normal signed0.1.0(16) build,11embedded signatures/14legacy pins/candidate/
  JPEG/privacy/no-QA checks pass; replacement installed, exact inventory16and
  launch verified. Existing profile reused until23November12:53:38Helsinki.
  Owner client15camera success does not verify new16region/GPS/direct fallback.
- Subsequent normal17build/signature/pin/privacy/no-QA checks pass, replacement
  installed/inventory17/launched; owner confirms visible answer as above. Same
  profile expiry. No encoder/model/runtime inference change. Final type-only
  ScrollView import lint correction does not alter emitted behavior; code checks
  rerun. Final receipts:`work/guide-visible-client17-20261116.i3iXE6/`.
- Final software/browser evidence and limits are recorded in TEST_EVIDENCE.md.
  Earlier failures are retained: geometry cap100000was too small for103836real
  vertices (raised bounded engineering cap to250000, no geometry reduction);
  coastal expectations corrected to require confirmation, not weaker1500mgate;
  shared test's Node imports moved to root pin-test to respect architecture;
  QA host needed real SafeAreaProvider/mobile package resolution and wrapping
  its own diagnostic JSON. These do not constitute model-accuracy improvements.

Private logs/artifacts (not committed):`work/guide-regions-20261116.nVAvUQ/`,
`work/objects-browser-20261116.Mdb4Qp/`, `work/guide-client16-20261116.RES7Ov/`.
No GitHub push, paid recognition or LAN server start. No public release claim:
broader item/region coverage, native GPS/network/airplane-mode/Android tests,
recognition quality, MEM-01, reproducible model delivery and store gates remain.
