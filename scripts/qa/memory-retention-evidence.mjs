import assert from "node:assert/strict";

export function assessCameraRetention(report) {
  assert.equal(report.schema, "memory-attribution-v1");
  assert.equal(report.cameraMode, true);
  assert.equal(report.cameraVerified, false);
  assert.equal(typeof report.failure, "boolean");
  assert.deepEqual(report.scoreHashes, []);
  assert.deepEqual(report.forwards, { mobileclip: 3, siglip: 3 });
  assert(Number.isSafeInteger(report.cameraStarts) && report.cameraStarts >= 3);
  assert(Array.isArray(report.rows) && report.rows.length > 2 && report.rows.length <= 3000);
  let previous = -1;
  for (const row of report.rows) {
    assert.deepEqual(Object.keys(row).sort(), [
      "elapsedMs",
      "event",
      "footprint",
      "heapBlocks",
      "heapReserved",
      "heapUsed",
      "lifetimePeak",
      "rss",
      "stage",
      "status",
    ]);
    assert(Number.isFinite(row.elapsedMs) && row.elapsedMs > previous);
    previous = row.elapsedMs;
    assert.equal(typeof row.event, "boolean");
    assert(typeof row.stage === "string" && /^[a-z0-9_]{1,64}$/u.test(row.stage));
    assert(Number.isInteger(row.status));
    for (const key of [
      "footprint",
      "heapBlocks",
      "heapReserved",
      "heapUsed",
      "lifetimePeak",
      "rss",
    ])
      assert(Number.isSafeInteger(row[key]) && row[key] >= 0 && row[key] < 2 ** 41);
  }
  const event = (stage) => {
    const rows = report.rows.filter((row) => row.event && row.stage === stage);
    assert.equal(rows.length, 1, `one_${stage}`);
    return rows[0];
  };
  const warm = event("warm_home"),
    home = event("camera_home_requested"),
    settled = event("camera_home_settled");
  assert(warm.elapsedMs >= 12000 && home.elapsedMs > warm.elapsedMs);
  assert(settled.elapsedMs - home.elapsedMs >= 20000);
  const delta = settled.footprint - warm.footprint;
  return {
    samples: report.rows.length,
    failedReads: report.rows.filter((row) => row.status !== 0).length,
    cameraStarts: report.cameraStarts,
    warmFootprintBytes: warm.footprint,
    settledFootprintBytes: settled.footprint,
    retainedDeltaBytes: delta,
    unchangedBudgetBytes: 32 * 1024 * 1024,
    boundedRetentionGatePassed:
      !report.failure && report.rows.every((row) => row.status === 0) && delta <= 32 * 1024 * 1024,
    sampledMaxRssBytes: Math.max(...report.rows.map((row) => row.rss)),
    kernelLifetimePeakBytes: Math.max(...report.rows.map((row) => row.lifetimePeak)),
    leakOrLeakFreedomVerified: false,
  };
}
