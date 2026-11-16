import assert from "node:assert/strict";
const median = (values) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
export function assessAppMemory(report, ownerReportedCaptures) {
  assert(
    report?.schema === "kig-app-memory-qa-v1" &&
      report.sampleIntervalMs === 100 &&
      report.sampledNotExactPeak === true,
  );
  assert.deepEqual(Object.keys(report).sort(), [
    "rows",
    "sampleIntervalMs",
    "sampledNotExactPeak",
    "schema",
  ]);
  assert(
    Number.isInteger(ownerReportedCaptures) &&
      ownerReportedCaptures >= 0 &&
      ownerReportedCaptures <= 10,
  );
  assert(Array.isArray(report.rows) && report.rows.length > 0 && report.rows.length <= 1800);
  let previous = -1,
    maximumGapMs = 0,
    previousPhase = 0;
  for (const row of report.rows) {
    assert.deepEqual(Object.keys(row).sort(), [
      "elapsedMs",
      "footprintBytes",
      "lifetimeFootprintPeakBytes",
      "phase",
      "rssBytes",
      "status",
    ]);
    assert(Number.isFinite(row.elapsedMs) && row.elapsedMs >= 0 && row.elapsedMs > previous);
    if (previous >= 0) maximumGapMs = Math.max(maximumGapMs, row.elapsedMs - previous);
    previous = row.elapsedMs;
    assert([0, 1, 2].includes(row.phase) && row.phase >= previousPhase);
    previousPhase = row.phase;
    assert(Number.isInteger(row.status));
    for (const key of ["footprintBytes", "rssBytes", "lifetimeFootprintPeakBytes"])
      assert(Number.isSafeInteger(row[key]) && row[key] >= 0 && row[key] < 2 ** 41);
  }
  const phases = [0, 1, 2].map((phase) => {
    const rows = report.rows.filter((r) => r.phase === phase),
      valid = rows.filter((r) => r.status === 0);
    const last = rows.at(-1)?.elapsedMs ?? 0;
    return {
      phase,
      samples: rows.length,
      failedSamples: rows.length - valid.length,
      durationMs: rows.length > 1 ? last - rows[0].elapsedMs : 0,
      medianFootprintBytes: median(valid.map((r) => r.footprintBytes)),
      final5sMedianFootprintBytes: median(
        valid.filter((r) => r.elapsedMs >= last - 5000).map((r) => r.footprintBytes),
      ),
      sampledMaxFootprintBytes: Math.max(0, ...valid.map((r) => r.footprintBytes)),
      sampledMaxRssBytes: Math.max(0, ...valid.map((r) => r.rssBytes)),
    };
  });
  const idle = phases[0],
    capture = phases[1],
    settling = phases[2];
  const retainedFootprintDeltaBytes =
    idle.medianFootprintBytes === null || settling.final5sMedianFootprintBytes === null
      ? null
      : settling.final5sMedianFootprintBytes - idle.medianFootprintBytes;
  return {
    samples: report.rows.length,
    failedSamples: report.rows.filter((r) => r.status !== 0).length,
    maximumGapMs,
    phases,
    ownerReportedCaptures,
    sampledMaxFootprintBytes: Math.max(...phases.map((p) => p.sampledMaxFootprintBytes)),
    kernelLifetimePeakFootprintBytes: Math.max(
      ...report.rows.map((r) => r.lifetimeFootprintPeakBytes),
    ),
    retainedFootprintDeltaBytes,
    boundedRetentionGatePassed:
      ownerReportedCaptures === 3 &&
      idle.durationMs >= 5000 &&
      capture.samples > 0 &&
      settling.durationMs >= 10000 &&
      report.rows.every((r) => r.status === 0) &&
      retainedFootprintDeltaBytes !== null &&
      retainedFootprintDeltaBytes <= 32 * 1024 * 1024,
    exactPerInferencePeakVerified: false,
    longRunLeakFreedomVerified: false,
    batteryVerified: false,
  };
}
