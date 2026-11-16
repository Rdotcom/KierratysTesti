# JPEG parity repair and app memory — November16,2026

## JPEG repair: completed

Baseline eeb8d5a/client12 had a strict Mac/iPhone score difference0.00085267579
for commons-3. Original decoder-only testing found53086different floats,
maxabs0.03921568. A separately registered CPU-preference diagnostic does not
resolve it. That option is retained only behind QA, not promoted as a fix.

The optional SigLIP JPEG path now uses pinned libjpeg-turbo3.2.1, accurate integer
IDCT/smooth upsampling, SIMD disabled, across macOS/iOS ARM64. Source commit
7b4993786d856cbccabfc0ed2f923ba000e326cc, archive SHA256
e10ff4ce2943a9021f9b0398fe00029915dd4eaf32c7560e36305341ec826735.
Own C adapter is bounded/memory-only, not a new JPEG or learned algorithm. It
rejects warnings, unsupported precision/CMYK/dimensions;8MB/8MP/4096axis bounds,
32MBintermediate limit and100progressive scan cap. Profiles not declared sRGB
are rejected. This does not authenticate ICC descriptions or material truth.
PNG/EXIF resize/normalization math, image model and text prototype pins unchanged.
New preprocessing identity is strict in native output and TS normalization;
old client12 JPEG policy is not silently accepted as the repaired policy.

Four fixed JPEGs: all repaired Mac/phone tensors byte-identical, whereas old
system decoding still differs in case3. Then exactly4newMac and4newphone worker
predictions, no inference failures/retries or threshold changes:

| Case | Top1 | Max error vs original PNG | Mac/phone score difference |
| --- | --- | ---: | ---: |
| commons-1 | multiple-cups | 0.00201452 | 0 |
| commons-2 | spoon | 0.00053869 | 0 |
| commons-3 | spoon | 0.00189275 | 0 |
| commons-4 | spoon-and-fork | 0.00120977 | 0 |

Both unchanged original top1/error≤0.005 and extra strictMac≤1e-5 now pass4/4.
103source/input/library pins and31lifecycle cases rechecked. These reused scenes
are implementation regressions, not independent quality samples. Signed helper
artifact hash was NOT separately frozen before these new calls; source/library/
input locks were. Do not turn this into a fully preregistered release benchmark.
Old failed results/gates remain historical failures, not overwritten by the repair.

C adapter1929assertions include a real generated JPEG, every truncated prefix,
wrong/null/oversized inputs and500deterministic malformed inputs. Same tests run
with full dependency+adapter ASan/UBSan instrumentation: exit0, empty sanitizer
stderr. This is useful regression evidence, not formal parser safety. macOS,
deviceARM64 and simulatorARM64 libraries compile; no x86/Samsung decoder claim.

## Signed actual app

KeepItGreen0.1.0(13), same identity, replaces12without uninstall/reset. Stable
SDK26.5 Release build and11embedded signatures pass; all14prior legacy resource
pins/privacy preserved, candidate model/prototype pins unchanged. IJG+BSD full
notices are a separate resource bundle, attribution in Legal/FI+EN. This software
is based in part on the work of the Independent JPEG Group. No NPM upgrade/root
lock change. Only local podspec checksum/static decoder integration changed.

Binary SHA256:772c2a99e8640ec82291de46f225771b767178558ebebbe7d324113001d17ec4.
Hermes SHA256:3f9050f5d9cabc69f71d2a89c3c39edbac1fa398e27fe0fc797c8ab8215f27ac.
Unpacked signed app202613097bytes; candidate bundle125494849bytes unchanged.
App-size delta359454bytes versus client12; not installed allocation/RAM/download.
Staged decoder artifacts2747398bytes include both device/simulator libraries and
headers. Raw model source/testphotos/QA sampler are absent from installed binary.
Profile reused, expires23November2026,12:53:38Helsinki; no renewal claimed.

## Actual-app memory measurement

Actual client13process, owner confirms3spoon camera cycles, each reporting
“lusikka - haarukka - veitsi”. No owner images read/copied/uploaded.1800samples
at nominal100ms:201idle/1599camera-phase;0failed task_info reads,maxgap934.01ms.
Idle median footprint59688776bytes, largest camera-phase sample114247976bytes,
kernel lifetime peak118868168bytes. Sampled maxRSS687702016bytes is distinct
from charged footprint: do not describe it as114MBRSS or guaranteed cheap RAM.

The1800sample cap arrived before phase2. Original retention gate stays
**false/incomplete**. No cap/threshold increased, original rows retained.
Separately preregistered passive follow-up, same process, owner returns Home,
150samples/14.86s,0failed reads,maxgap100.80ms,zero additional recognition.
Final5smedian footprint105809856bytes; RSS≤177946624bytes. Follow-up kernel
lifetime peak123652032bytes includes later Home/JIT/serialization, not an
isolated inference peak. Home-minus-original-idle delta46121080bytes(43.98MiB)
**fails the unchanged32MiB diagnostic boundary**. Do not call the first run
complete/passed because a follow-up exists, or call observed retention a proven
leak. Cold versus warm UI/framework/model/debugger caches have not been isolated.

Finding **MEM-01 / medium / locally executable**: retained footprint exceeds the
registered cold-baseline diagnostic budget. Reproduce with fresh client13idle,
three spoon captures, then Home/15sidle; actual data are the two raw numeric
reports and initial/settling review JSONs under the client run. Affects the real
camera/recognition/Home process, not proven attributable to SigLIP alone. Next
remediation: matched warmed-view baseline and stage-specific numeric profiling
to attribute46.12MBbefore changing caches. No OOM/process death observed during
the measured cycles, but long-run leak freedom/battery/memory pressure NOT passed.

Instruments still reports the CoreDevice-available phone offline. LLDB with local
app binary/fresh suspended launch works. Initial attach stall/GCD typedef/JIT/
ARC/date setup failures occurred before sampling and are retained; a failed
expression EXC_BAD_ACCESS was unwound by debugger, not a camera-flow crash.
Corrected main-run-loop NSTimer code is debugger-injected, not compiled into
the app. Its overhead remains included. Report sampled maxima versus kernel
lifetime peak separately; neither proves exact per-inference peak. Protocol:
docs/research/app-memory-measurement-2026-11-16.md, including passive amendment.

## Evidence and limitations

Private ignored evidence (no device/account metadata published):

- work/jpeg-memory-20261116.Rq7CuZ/: initial CPU diagnostic/failed iOS CMake
  processor detection, corrected scalar builds/receipts,1929normal/sanitizer
  tests, pod install, full validation. Official release URL initial zero-byte
  download retained; pinned codeload source was acquired/verified instead.
- work/jpeg-repair-20261116.X9lFRa/: helper's old exclusive marker safely refused
  replacement-run execution; zero new predictions. Its early collection lacked
  new tensors and is retained as a failed diagnostic setup, not success.
- work/jpeg-repair-v3-20261116.dScX6H/: per-run diagnostic directory fix, actual
  four phone/Mac tensor pairs, source/library locks and signed helper build.
- work/jpeg-scores-20261116.ywUVhl/: fixed JPEG lineage, native Mac binary/lock,
  actual4worker rows and review. Premature prepare without lineage failed before
  dispatch; no extra predictions. New JPEG bridge preserves legacy resources.
- work/jpeg-worker-device-20261116.JW8fbm/: native/source/library locks, initial
  locked launch/early collection failure, unlocked actual4rows/31lifecycle cases,
  read-only review-unlocked.json. Signed helper hash timing qualification above.
- work/jpeg-client13-20261116.M76KVf/: rollback12, signed13/build/verification,
  replacement install/launch; actual-app memory receipts will be retained here.

Actual memory receipts are now under the client run's memory/:two raw files,
initial-review.json and settling-review.json. Raw hashes:
7d459e247beeb35771e13906d3bad9a332ddf2a4065099f6b89e36481aeb3d2b
(251220bytes) and224bf32cd037c1f95b673a7e45ca6faab4dc370f66f208dbd200f13a3f817d39
(21222bytes). Only these generated files were copied from real app Documents;
no scan history or other app data inspected. A read-only type/size check confirms
both are regular files. Cleanup expression failed to compile before deletion:
the two numeric files remain locally on the phone (272442bytes), not claimed
deleted; no stronger deletion retry or app reset. They contain no photo/text/
location/identifier and can be cleaned during the next diagnostic session.
Temporary helper uninstall/empty inventory pass. Debugger detached; normal13
relaunched with a fresh process, removing injected runtime code/timers. Final
installed inventory confirms13. Actual app data were not uninstalled/reset.

Final pnpm validate:mobile and pnpm validate exit0:1965tests(907Node+1058workspace),
all checks/builds/18web routes pass,19existing lint warnings;9newNode regressions
and1mobile old-policy rejection. NativeC1929assertions are separate. No release
memory pass implied by green software checks; MEM-01remains open.

No paid call/key/server exposure/push. Public release remains NO-GO: broader
independent unknown/material accuracy, Android/Samsung engine/device evidence,
airplane-mode/battery/memory-pressure and clean-checkout model asset delivery
are not resolved by four JPEGs or this bounded memory exercise.
