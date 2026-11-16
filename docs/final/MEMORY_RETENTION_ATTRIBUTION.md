# Actual-app memory attribution — November 16, 2026

## Outcome

MEM-01 remains **medium, locally executable, OPEN**. A bounded camera startup/
shutter-readiness safeguard is implemented, but the physical paired test does
**not** establish lower retained memory or removal of the extra session start.
Do not call it a memory-leak fix. Public release remains NO-GO.

## Method and independent evidence checks

Protocol: `docs/research/memory-attribution-protocol-2026-11-16.md`, registered
before dispatch/repair comparison. Same iPhone, identity/data and profile; signed
Release artifacts. No LLDB/JIT sampler, network, paid service or owner photo/OCR/
history export. Native 100 ms timer records numeric Mach footprint/RSS/lifetime
peak and aggregate malloc counters. Camera notifications count session starts,
not frames. Each run's signed artifact and exact native source were frozen before
launch: all **235 pins/run, 705 total**, independently rehashed unchanged. The
embedded JS is included in those signed-artifact pins; initial source archives
do not separately include TS source. The freezer now archives those TS files too
for future runs, not retroactively claiming they were frozen separately here.

### Fixed public fixture, native path only

`work/memory-attribution-20261116.sd3qzN`: 486 samples, zero failed reads, three
MobileCLIP and three SigLIP forwards, no camera. Only the already cleared
Commons spoon fixture was used. All three 15-score-array hashes match the prior
JPEG-repaired control:
`2eb9d22af0f892f81ecf353cd2fe8cdbef327411d8d4c7656d9f04d23116c7d5`.

- Warm Home footprint 64,325,376 bytes; final before allocator intervention
  77,678,432 bytes: **13,353,056 bytes extra**, not the old full 46.12 MB.
- Heap used 15,858,208 → 29,022,208 bytes. Large model RSS returns from roughly
  518–522 MB to 140–145 MB after the worker autorelease pool drains.
- One QA-only public allocator pressure-relief call returns **zero bytes**;
  footprint does not fall. It is not included in the normal app.

This excludes a persistently resident full SigLIP working set as the explanation
for the observed post-request RSS in these runs. It does not prove every object
is released, identify all cache owners, or establish leak freedom.

### Owner-operated camera comparison

Three spoon captures per run, each confirmed successful by the owner. Each run
counts three MobileCLIP plus three SigLIP completions, persists no owner scores
or images, returns Home five seconds after completion and settles for 20 seconds.
Warm baseline is after 12 seconds on Home, not a warmed recognition pipeline.

| Numeric measure | Baseline client13 | Startup safeguard client14 |
| --- | ---: | ---: |
| Samples / failed reads | 1462 / 0 | 1298 / 0 |
| Camera starts for 3 captures | 4 | 4 |
| Warm Home footprint, bytes | 63,227,648 | 64,751,360 |
| Settled Home footprint, bytes | 97,109,856 | 100,353,912 |
| Retained difference, bytes | 33,882,208 | 35,602,552 |
| Unchanged 32 MiB boundary | FAIL | FAIL |
| Sampled maximum RSS, bytes | 661,700,608 | 685,096,960 |
| Kernel lifetime footprint peak, bytes | 115,672,928 | 133,187,448 |

The second difference is 1,720,344 bytes larger. Different human cadence/scene/
OS scheduling preclude a statistical regression or causal claim from this single
pair. Both failures remain failures; no gate adjustment or resampling for green.
The initial hypothesis that size negotiation caused the extra start is **not
supported by the intervention**. Four starts remain; do not present it as fixed.

Private receipts:

- `work/memory-camera-20261116.ehvr5w/report.json`, SHA256
  `6860f20d4620447200a7a0be87e2e1c1f50bb1c183196ea245cea276d7ef5d7f`.
- `work/memory-repair-20261116.zVxEIl/report.json`, SHA256
  `bd99ac2e3fa84390fdf3462c6011bb1bdaf9938e099b9deee31443742f511a87`.
- Native-only report SHA256
  `10248a31a65701b7589e79dc625d32fc948f8656c21ce6f7b68da8a5011502ba`.

The old 1800-sample incomplete settling run and passive 46,121,080-byte retained
delta remain in `JPEG_REPAIR_AND_APP_MEMORY.md`; these runs do not replace or
retroactively pass them. Footprint, resident memory and storage are not synonyms.

## Implemented safeguard, not a claimed retention cure

`local-photo.tsx` now supplies an explicit 1280×720 initial picture preset on
every mount, rather than Expo's default Photo while async negotiation runs.
Existing under-2-MP selection and quality 0.4 remain. The shutter waits for that
selection, ignores stale camera instances/generations and retains a bounded
fallback if negotiation fails. This removes the source-level full-resolution
default/premature-shutter hazard without claiming it caused this memory result.
No model, score policy, prototype, decoder, material rule or barcode change.

QA instrumentation is compile-time-only (`LOCAL_MEMORY_QA`, explicit pod env and
launch arguments); no public diagnostic bridge. Normal signed-app verification
rejects the probe markers and fixture bundle. Generated QA resources are moved
recoverably out of the incremental product before the normal build; signed
diagnostic artifacts/rollback remain. Numeric reports remain privately in app
caches; no deletion or app-data reset is claimed.

## Remaining work and validation

Engineering/Codex owns the next isolation: separate first-use UI/camera caches
from repeated native allocation using a preregistered matched already-warmed
pipeline baseline and repeated bounded cycles. Identify retained allocation
owners before changing caches; no fake memory warnings or ineffective allocator
trim. Device unlock/operator help only when needed. A separate human-review gate
has not been reintroduced.

Normal signed0.1.0(14) is replacement-installed and launched, exact inventory
verified. All11embedded signatures/14legacy pins/candidate/JPEG/privacy pass,
no QA probe/fixture in normal app. Profile reused through23November12:53:38
Helsinki. Final mobile/full1982tests(920Node+1062workspace), allchecks/builds/
18web routes pass with19existing warnings. Normal14camera was not independently
repeated after diagnostic14's three successes; no new general accuracy claim.
Installation/verification and final software evidence are recorded in
`TEST_EVIDENCE.md`. Neither a successful camera test nor software
tests close independent quality, Android/Samsung, energy, memory-pressure,
airplane-mode, clean-checkout asset or store-release requirements.
