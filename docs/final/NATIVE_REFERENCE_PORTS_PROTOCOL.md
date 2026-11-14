# Experimental native reference ports — frozen synthetic integration protocol

2026-11-14. Owner waives a separate human checker (D-086), not source uncertainty
or licensing/privacy. This protocol contains generated test imagery only; no
product identity, personal photo, paid/cloud request or internet acquisition.

Before calls, pin source/test/protocol/dependency files, compiled Swift CLI,
generated input JPEGs, pinned decoder and old QA encoder artifacts. Create one
canonical attempt ledger; never overwrite/retry it after image work. A failure
stays a failure and requires a separately versioned protocol for another run.

Compile the actual shipping predictor/engine with Swift 6 and warnings-as-errors
on macOS. Run no-image lifecycle/malformed/hash checks plus legacy checks. Also
compile shipping predictor/engine for arm64 iOS with the actual iPhoneOS SDK,
without QA hooks. Neither is a full Expo app build or physical-device proof.

The once-only integration driver invokes the same engine via the compiled CLI:

- Load/integrity/interface-only capability once; no accuracy authority.
- Four generated 128×128 JPEGs: same seeded texture qualities 90/95/85 and flat
  gray calibration negative. Two references, one calibration, one query; no real
  product or verified label. Compile and query through the actual mobile adapter
  and public byte-bound shared runtime; reject a training copy before encoding.
- Four reference-port encodes (one full-frame prediction each), three RGB
  extractions; each native result must join actual JPEG/resource hashes.
- Run the unchanged pinned two-view Mac QA exporter once on the query. The new
  full-frame vector must agree with its fit vector: max absolute difference
  ≤1e-10, cosine ≥0.999999999. Distinct encoder IDs remain distinct; numerical
  parity is not permission to reuse cached Mac vectors on iPhone.
- Eight generated, asymmetric four-colour quadrant JPEGs carry EXIF orientations
  1–8. RGB output must have the expected oriented dimensions/corner colours,
  bounded RGB count and actual original-byte SHA. No model prediction for these.

Budgets: four new full-frame predictions + two old QA predictions = six; six
model loads (one capability, four encode processes, one old QA); eleven RGB
extractions (three runtime + eight orientation); at most 20 native hash calls
and 40 total CLI processes. The runtime/adapter performs real SHA calls, not a
caller-provided digest stub. All subprocesses have wall/output bounds; no retry.
Write a per-process attempt before spawn and retain bounded raw outputs. Check
all source/resource/input pins after execution and retain status/failure.

Passing proves only the synthetic Mac invocation of shipping Swift operations,
JS contracts and runtime joins. Separate process invocation does not prove a
warm iPhone cache, Expo bridge binary, battery, latency, camera, permission,
Android, product accuracy or public readiness. Default UI remains unchanged.
