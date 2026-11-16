import assert from "node:assert/strict";
import test from "node:test";
import { assessCameraRetention } from "../qa/memory-retention-evidence.mjs";
const fixture = (delta = 33_882_208) => ({
  schema: "memory-attribution-v1",
  cameraMode: true,
  cameraVerified: false,
  failure: false,
  scoreHashes: [],
  forwards: { mobileclip: 3, siglip: 3 },
  cameraStarts: 4,
  rows: [
    [12000, "warm_home", 63_227_648],
    [13000, "camera_home_requested", 63_227_648 + delta],
    [33000, "camera_home_settled", 63_227_648 + delta],
  ].map(([elapsedMs, stage, footprint]) => ({
    elapsedMs,
    stage,
    footprint,
    event: true,
    heapBlocks: 1,
    heapReserved: 1,
    heapUsed: 1,
    lifetimePeak: footprint,
    rss: footprint,
    status: 0,
  })),
});
test("retains an above-budget failure without rounding or raising the boundary", () => {
  const result = assessCameraRetention(fixture());
  assert.equal(result.retainedDeltaBytes, 33_882_208);
  assert.equal(result.unchangedBudgetBytes, 33_554_432);
  assert.equal(result.boundedRetentionGatePassed, false);
});
test("incomplete/failed measurements cannot pass even below budget", () => {
  const input = fixture(1);
  input.failure = true;
  assert.equal(assessCameraRetention(input).boundedRetentionGatePassed, false);
  input.failure = false;
  input.rows[0].status = 1;
  assert.equal(assessCameraRetention(input).boundedRetentionGatePassed, false);
});
test("requires three real completions and the full settling window", () => {
  const input = fixture();
  input.forwards.siglip = 2;
  assert.throws(() => assessCameraRetention(input));
  const early = fixture();
  early.rows[2].elapsedMs--;
  assert.throws(() => assessCameraRetention(early));
});
test("refuses owner-image outputs and unexpected sample fields", () => {
  const input = fixture();
  input.scoreHashes = ["owner-output"];
  assert.throws(() => assessCameraRetention(input));
  const extra = fixture();
  extra.rows[0].photo = "private";
  assert.throws(() => assessCameraRetention(extra));
});
test("does not equate a bounded retention pass to leak freedom", () => {
  const result = assessCameraRetention(fixture(1));
  assert.equal(result.boundedRetentionGatePassed, true);
  assert.equal(result.leakOrLeakFreedomVerified, false);
});
