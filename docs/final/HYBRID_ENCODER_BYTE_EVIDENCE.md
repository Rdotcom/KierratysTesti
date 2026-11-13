# Local hybrid encoder byte binding — November 13, 2026

Status: engineering integration smoke PASS; product recognition/public release
NO-GO. This follows owner approval of the free pretrained encoder plus our own
logic. The app does not yet consume the new retrieval path.

## Implemented

`scripts/qa/reference-image/local-embedding-adapter.mjs` supplies the trusted QA
platform boundary. It snapshots a plain nonshared/nonresizable Uint8Array, bounds
JPEG input to1,500,000bytes and passes only base64 image bytes on stdin. It hashes
actual encoded bytes, not filenames/labels or a caller's proposed hash. The pinned
worker itself decodes and authenticates its received image hash.

The adapter authenticates the exact worker, current/historical Swift source,
full compiled model tree and prototype dependency before and after work. Both
views, output shape512/Float32, preprocessing, norms, all progress stages and
completed counters must agree before a center-vector receipt is returned.
The receipt hashes the actual center vector and includes an encoder identity
covering source/executable/model/dependencies. This is computational integrity,
not identity truth, rights approval or a calibrated probability.

The existing exporter performs center AND fit predictions; selecting center for
retrieval does not conceal the second call. No new training/text prediction,
weights, model download, package, network/API/key or paid service is introduced.

Subprocess stdout/stderr are bounded, no shell or inherited service environment
is used, and a15second parent deadline/abort/output overflow kills the process.
The single-flight gate remains held until close; late success cannot surface.
The native logical budget is12seconds. Process close may be delayed by OS state;
neither limit is a hard real-time or battery guarantee. Failed raw stdout/stderr
is retained; incomplete progress provides lower bounds, not zero-work evidence.

## Initial failure preserved

The first no-image asset check fails the historical source pin:
current`904d18b29d37f6dcc5c86b1e7f84ed5d62fdf8a33f0b4d693f1952d59b9b69da`
versus historical`f63a4484d8d9a63a3101f6b278df6fb56849c3901fac4822abfd1b7eb03f9099`.
Git0b75faf proves deletion of exactly one terminal LF after the historical
binary build. The adapter checks both exact current bytes and exact bytes plus
one LF against those two fixed hashes; it does not generically trim whitespace
or rewrite old evidence. Worker binary remains
`1c4e9c070a6ea969fabf81dc1f372f4b572dfb83237a4db54ba27113be6e29a5`.
No image call occurred before this discrepancy was resolved.

## Once-only generated-image smoke

Runner: `scripts/qa/reference-image/embedding-byte-smoke.mjs`. Private output:
`work/hybrid-byte-smoke-2026-11-13.TzOh5l/result/`.
Canonical claim: `work/hybrid-byte-adapter-smoke-v1.json`. Do not delete/reset it
or rerun the predictions under another directory after inspecting results.

Before predictions, freeze70source files, the bundled public retrieval engine,
the independently pinned58decoder artifacts, actual worker/resources, two exact
generated128×128JPEG encodings and their hashes, gallery/query allocation,
cosine0.9/margin0.08 and the maximum2processes/2decodes/4image/0text predictions.
The two JPEGs encode the same generated RGB texture at qualities90/95. They are
not independent photos and contain no products or accepted human labels.

- Protocol SHA256:
  `c3e496760abee73176682b3e58c52da75fc6ab492e978a8d54bf7b3aa6175a44`.
- Summary SHA256:
  `c12d2639bd319e3bd3c0e2e8650f1db9bb9f4fd0fec2379b35ed501b03d146d9`.
- Actual2successful processes/model loads,2decodes,4completed image predictions,
  0text predictions,0not-attempted; original raw outputs/progress/attempts retained.
- Actual center vectors and image hashes join the new retrieval engine; cosine
  0.9976787049266318 yields the synthetic candidate. Same encoded gallery image
  is rejected as an enrollment query. This is NOT product recognition accuracy.
- Source/engine/resources rechecked after calls. Separate receipt/source/hash/
  counter recount passes with zero new model/image work. Desktop process wall
  times705/154ms are smoke observations, not phone latency/energy benchmarks.

## Validation and remaining work

19newNode regressions use synthetic worker envelopes and real isolated Node
children for timeout/cancel/flood/spawn failure; no real model in unit tests.
Full`pnpm validate`passes1607unique tests(691Node+916workspace), all format/lint/
types/boundaries, package/API builds and18web routes.13old lint warnings remain.
Log:`/tmp/kig-embedding-adapter-full.LYW0o2`. No fresh live advisory/Expo/remoteCI,
Linux/Node24/fresh-install/native build or physical-device pass is claimed.

Next is a registered three-arm development comparison and conservative conflict/
quarantine fusion using the existing seen OFF references. Old failed experiments
remain unchanged. Independent variant/identity/rights review, new representative
queries, native/mobile integration, real camera/offline/permissions/accessibility/
latency/memory/energy/Android and privacy/operations/store gates remain. Source
iOS11/Android3 and installed client10 are unchanged; no push/install/publication.
