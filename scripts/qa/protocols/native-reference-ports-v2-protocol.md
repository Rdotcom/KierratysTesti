# Native reference ports v2 — orientation repair and unchanged gates

2026-11-14. NATIVE_REFERENCE_PORTS_PROTOCOL.md defines unchanged inputs, limits,
parity tolerances, corner-colour tolerances and no-release/accuracy authority.
Its v1 attempt FAILS at orientation 1: RGB has bottom corners in the top row.
It made four new predictions/two legacy predictions and retained all receipts.
Protocol: 6ef9ec674e74fb4951f7f324f4474b2ba8c5aa855bb5b8d86c63f9a7fdcda1f1.
Result: 0e8f4e85e8de2e7440bfd61bdd384cf7ef25ffc288bc714cc8682b32903988cb.
No reset, relabel, tolerance change or quality pass is allowed for v1.

Repair only the RGB renderer's extra UIKit-style vertical transform. Add a
native generated-quadrant regression for all eight EXIF orientations before
another actual-model run. Retain the same versioned oriented top-down RGB
contract; this fixes an unshipped implementation, not cached production data.
The default UI still has no reference-runtime consumer.

V2 freezes its own sources/binary/generated inputs/JS bundles before image work,
uses `work/native-reference-port-smoke-v2-attempt.json`, and repeats the exact
original four generated texture inputs and eight quadrant images. All original
budgets, parity/corner thresholds and limitations stay. Pin the v1 summary and
protocol as predecessor evidence. Preserve raw results and refuse a second v2
attempt regardless of success. Generated regression calls outside the frozen
integration run are separately counted and never described as product testing.
