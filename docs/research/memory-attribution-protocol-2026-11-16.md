# MEM-01 stage attribution and repair — November16

Baseline d453a91/client13. Owner asks to identify and repair retained memory.
Previous1800+150sample/46.12MBdelta and failed32MiB boundary remain unchanged.
Do not call cold/warm caches a leak without attribution or tune the memory gate.

Build an explicitly QA-flagged actual app, same identity/data/profile, normal
signed13rollback retained. No debugger/JIT sampler: use a bounded native numeric
sampler after Home startup, with footprint/RSS/kernel lifetime peak AND aggregate
malloc size_in_use/size_allocated. No heap contents/pointers, owner image/OCR/
history/location/device identifiers/logging/network. QA-only auto-run requires
an exact launch argument and a pinned bundled fixture/manifest; normal build must
contain neither probe code, fixture nor numeric-writing route. No paid services.

Use only the previously licensed commons-3 JPEG (SHA256
42b5de1f7b4880645efef9237399a9268ce54e6c8784fca11b3a98ed7d8edf71).
Warm Home12s, readiness once, then3cycles of real product-evidence worker followed
by SigLIP object worker,4ssettling between cycles,12sfinalsettling. Expected at
most3MobileCLIP+3SigLIP forwards; record actual encoder completions/failures,
never fabricate expected counts. This is actual-app native-path attribution,
NOT camera/preview/JS-coordinator acceptance or new independent accuracy data.
Timestamp fixed phase boundaries: decode, Vision requests, MobileCLIP, legacy
cache release, SigLIP integrity/preprocess/load/predict and autorelease settlement.
No recognition output persisted other than fixed-fixture hashes of15score arrays.

Then QA-only one public malloc_zone_pressure_relief(NULL,0) intervention, recording
its duration/released-byte count and before/after malloc/footprint. It releases
unused allocator pages, not live objects; do not send fake UIKit memory warnings
or clear all unrelated caches to manufacture success. This is a diagnostic,
not an assumed production fix. Preserve full data/errors and cap at900samples.

Freeze input/model/library/source and signed artifact hashes BEFORE launch.
One baseline run; only after a source-backed repair, one new matched3cycle run,
same controls/budgets. Preserve failure/unknown/SigLIP/barcode/OCR behavior and
exact model/prototype/JPEG parity. Validate meaningful regression tests, full
mobile/root checks, signed normal app and camera after the local repair.
Follow-up actual camera exercise uses warmed matched Home before/after, no JIT;
unchanged32MiB retention diagnostic, no claim of leak freedom/battery/OOM from it.

Sources checked2026-11-16: installed SDK26.5 malloc/malloc.h documents NULL-zone
aggregate statistics/pressure relief and available API; ReactNative0.88.1 actual
RCTImageCache/RCTImageLoader source documents2MiBimage/20MiBcache defaults and
HTTP cache behavior. This alone does not attribute retained data-URI preview RAM.
- https://github.com/apple-oss-distributions/libmalloc/blob/main/include/malloc/malloc.h
- https://developer.apple.com/documentation/vision/vnrequest/preferbackgroundprocessing
  (potential footprint/latency tradeoff, not enabled/tuned without evidence).

## Second isolation: actual camera without JIT (registered after baseline)

Baseline actual-app native3+3forwards succeeds: warmHome64.33MB, settled77.68MB,
heap used15.86→29.02MB, model RSS517–522MB→140–145MB after settlement. Public
allocator relief returns0bytes,0.002ms/no footprint reduction. Do NOT ship it as
a fix. Native-only retained delta13.35MB does not explain all prior46.12MB.

Add explicit QA-only camera mode, separate run suffix/marker/output and source/
signed lock; no automatic fixture inference in that mode. Native timer100ms,
3000row cap, warmHome12s then owner3spoon captures within210s, with numeric camera
session start/stop notifications (no frame/AVCapturePhoto access). After third
SigLIP completion wait5s, open own Home deep link, settle20s, report. No owner
photo/OCR/score hashes stored. Compare matched Home before/after, same32MiB
boundary, record failures/cadence/actual forward counts. This is isolation before
choosing a real repair, not resampling the old failed JIT measurement for green.

Source-backed candidate, registered before camera outcomes: local-photo mounts
CameraView without pictureSize on first use. Expo58.0.14 defaults to Photo and
starts that session before onCameraReady asynchronously selects1280x720 (largest
available preset under the existing2MP bound). It also enables shutter before
size negotiation resolves. Test an explicit1280x720 initial preset on EVERY
mount, and enable shutter only after bounded negotiation; no reduction from the
previous negotiated capture quality/resolution. Preserve normal fallback/error/
generation cancellation, manual/barcode/model rules. This fixes a real startup
allocation/race hazard; memory improvement is a hypothesis until paired camera
measurements. Do not attribute all46.12MBto it without evidence.

## Actual paired outcome: hypothesis not confirmed

Client13camera1462rows/0failed reads: Home63,227,648→97,109,856bytes,
delta33,882,208. Client14camera1298rows/0failed reads:64,751,360→100,353,912,
delta35,602,552. Both exceed unchanged33,554,432bytes. Both count4camera starts
for3successful owner captures and3+3model completions. The initial restart
attribution is NOT supported by the intervention; preserve this failure and do
not repeat for green. Startup/readiness bound is a safeguard, not a proven memory
fix. All235signed/native source pins/run rehash unchanged. No owner photos/scores
persisted, no heap/owner-data inspection. Full results/limits in
docs/final/MEMORY_RETENTION_ATTRIBUTION.md. MEM-01 stays medium/open/local.
