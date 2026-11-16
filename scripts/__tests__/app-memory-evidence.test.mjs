import assert from "node:assert/strict";
import test from "node:test";
import { assessAppMemory } from "../qa/app-memory-evidence.mjs";
function fixture() {
  return {
    schema: "kig-app-memory-qa-v1",
    sampleIntervalMs: 100,
    sampledNotExactPeak: true,
    rows: Array.from({ length: 202 }, (_, i) => ({
      elapsedMs: i * 100,
      phase: i < 61 ? 0 : i < 91 ? 1 : 2,
      status: 0,
      footprintBytes: i >= 61 && i < 91 ? 600000000 : 60000000,
      rssBytes: 300000000,
      lifetimeFootprintPeakBytes: 600000000,
    })),
  };
}
test("whole-app bounded retention pass does not mean peak/leak/battery approval", () => {
  const r = assessAppMemory(fixture(), 3);
  assert(r.boundedRetentionGatePassed);
  assert.equal(r.sampledMaxFootprintBytes, 600000000);
  assert.equal(r.retainedFootprintDeltaBytes, 0);
  assert.equal(r.exactPerInferencePeakVerified, false);
  assert.equal(r.longRunLeakFreedomVerified, false);
  assert.equal(r.batteryVerified, false);
});
test("persistent growth beyond original32MiB fails rather than raising gate", () => {
  const f = fixture();
  for (const r of f.rows) if (r.phase === 2) r.footprintBytes += 34 * 1024 * 1024;
  assert.equal(assessAppMemory(f, 3).boundedRetentionGatePassed, false);
});
test("failed readings and missing/short phases cannot masquerade as success", () => {
  const f = fixture();
  f.rows[0].status = 5;
  assert.equal(assessAppMemory(f, 3).boundedRetentionGatePassed, false);
  assert.equal(
    assessAppMemory({ ...fixture(), rows: fixture().rows.filter((r) => r.phase !== 2) }, 3)
      .boundedRetentionGatePassed,
    false,
  );
});
test("actual owner capture denominator cannot be inflated by timer samples", () => {
  assert.equal(assessAppMemory(fixture(), 1).boundedRetentionGatePassed, false);
  assert.equal(assessAppMemory(fixture(), 0).ownerReportedCaptures, 0);
});
test("malformed/privacy-bearing/clock-reversed data reject", () => {
  const f = fixture();
  assert.throws(() => assessAppMemory({ ...f, photo: "private" }, 3));
  f.rows[1].elapsedMs = -1;
  assert.throws(() => assessAppMemory(f, 3));
});
