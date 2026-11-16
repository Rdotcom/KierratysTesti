# Actual-app memory measurement — November16

Registered before starting the sampler in client13. Native JPEG repair uses no
model/threshold tuning. Memory evidence must come from the actual development-
signed Release app, not the isolated helper. Preserve data/rollback/signing.

LLDB can attach to a freshly suspended actual app after unlock, even while
Instruments reports it offline. Use public Mach task_vm_info for phys_footprint,
resident_size and ledger_phys_footprint_peak. A debugger-injected, numeric-only
serial timer samples100ms/up to1800rows. Phases:0idle (at least5s),1owner-controlled
camera recognition (request3spoon captures),2settling (at least10s). No images,
OCR, histories, secrets, device identifiers or exact timestamps in sampled file.
Copy only kig-app-memory-qa.json, not the real app's Documents directory.

Report all samples/errors/cadence gaps, per-phase footprint/RSS, sampled maximum
and kernel lifetime footprint peak separately. A sampled maximum is not exact
per-inference peak; lifetime peak includes startup/debugger activity. Classify
this measured exercise as no obvious retained-growth regression only if all
task_info calls succeed, required phases/durations exist, no process death is
observed and final5s settling median footprint is within32MiB of idle median.
If owner completes fewer captures, retain the true count; do not claim the
three-cycle exercise passed. This is not a long-run leak, OOM-pressure, battery,
Android or independent accuracy approval. JIT/sampler overhead remains included.

On completion cancel the timer, restore idle-timer behavior, detach, collect the
numeric-only report and relaunch the normal app to remove injected runtime code.
No sampler/QA fixture is compiled into the shipping binary. Remove only the
temporary helper and our exact generated numeric report after receipts are kept.

Source: Apple's WWDC22 Profile and optimize your game's memory (accessed
2026-11-16), https://developer.apple.com/videos/play/wwdc2022/10106/ . Installed
SDK26.5 mach/task_info.h defines the metrics/count layout. Baseline client12
one-shot reading (before this measurement):footprint57984840,RSS321093632,
lifetime footprint peak59492168bytes. It is not client13 baseline or peak evidence.

## Passive follow-up registered after initial timer cap

Initial1800samples contain201idle/1599camera-phase samples; owner confirms three
successful spoon captures. Timer cap arrived before phase2. Original bounded
retention gate remains false/incomplete, no rows/gates discarded or inflated.
Actual idle median59688776bytes, sampled max114247976, kernel lifetime peak
118868168, sampled maxRSS687702016. All1800task reads succeed; maxgap934.01ms.
This measures the real app including UI/debugger, not helper inference alone.

Collect a SEPARATE passive150sample100ms settling window after return to Home,
same app process, zero additional recognition. Owner may navigate home; no new
photos requested. Copy a separate kig-app-memory-settling-qa.json; retain original
file unchanged and original incomplete outcome. Report post median versus original
idle with the same32MiB diagnostic boundary, explicitly a follow-up, not a repaired
original protocol pass or proof of leak freedom. Do not raise cap/threshold to
make the first run green. No app data/recognition-source changes for this test.
