import assert from "node:assert/strict";
export const mobileParityPolicy = Object.freeze({
  version: "siglip-image-only-coreml-v1",
  images: 4,
  maxResourceBytes: 150 * 1024 * 1024,
  baselineScoreTolerance: 0.00001,
  arms: Object.freeze({
    fp16: Object.freeze({ minCosine: 0.999, maxScoreError: 0.001 }),
    int8: Object.freeze({ minCosine: 0.995, maxScoreError: 0.005 }),
  }),
});
export function assessMobileParity(result) {
  assert(result?.schemaVersion === mobileParityPolicy.version, "version");
  assert(
    Array.isArray(result.baseline) &&
      result.baseline.length === 4 &&
      new Set(result.baseline.map((r) => r.id)).size === 4,
    "baseline_rows",
  );
  const baselinePassed = result.baseline.every(
    (r) =>
      !r.failure &&
      Number.isFinite(r.parentScoreMaxError) &&
      r.parentScoreMaxError <= mobileParityPolicy.baselineScoreTolerance,
  );
  const report = {};
  for (const [name, gate] of Object.entries(mobileParityPolicy.arms)) {
    const arm = result.arms[name];
    assert(
      arm &&
        Array.isArray(arm.rows) &&
        arm.rows.length === 4 &&
        new Set(arm.rows.map((r) => r.id)).size === 4,
      "arm_rows",
    );
    assert(
      arm.rows.every((r) => result.baseline.some((b) => b.id === r.id)),
      "arm_ids",
    );
    const parity =
      baselinePassed &&
      arm.rows.every((r) => {
        const b = result.baseline.find((b) => b.id === r.id);
        return (
          !r.failure &&
          r.top1 === b.top1 &&
          Number.isFinite(r.embeddingCosine) &&
          r.embeddingCosine >= gate.minCosine &&
          r.embeddingCosine <= 1.00001 &&
          Number.isFinite(r.maxScoreError) &&
          r.maxScoreError >= 0 &&
          r.maxScoreError <= gate.maxScoreError
        );
      });
    const sizePassed =
      Number.isSafeInteger(arm.resourcesBytes) &&
      arm.resourcesBytes > 0 &&
      arm.resourcesBytes <= mobileParityPolicy.maxResourceBytes;
    report[name] = {
      parityPassed: parity,
      sizePassed,
      engineeringGatePassed: parity && sizePassed,
      failures: arm.rows.filter((r) => r.failure).length,
      top1Preserved: arm.rows.filter(
        (r) => !r.failure && r.top1 === result.baseline.find((b) => b.id === r.id).top1,
      ).length,
      releaseReady: false,
      physicalDeviceVerified: false,
    };
  }
  return { baselinePassed, arms: report, releaseReady: false };
}
