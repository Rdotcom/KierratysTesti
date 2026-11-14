import assert from "node:assert/strict";
import test from "node:test";
import {
  checkNativeRgb,
  checkNativeVector,
  nativeEvidencePath,
  recountNativeMetrics,
} from "../qa/review-native-corpus.mjs";

test("receipt reader restricts source scope and never opens secrets/outside paths", () => {
  const root = "/synthetic-repository";
  assert.equal(
    nativeEvidencePath("shared/domain/src/index.ts", root),
    `${root}/shared/domain/src/index.ts`,
  );
  for (const file of [
    ".env",
    "/private.json",
    "../outside.ts",
    "scripts/qa/../../.env",
    "mobile/app/.env",
    "shared/domain/src/.env",
  ])
    assert.throws(() => nativeEvidencePath(file, root));
});

const identity = { encoderSha256: "a".repeat(64), preprocessingSha256: "b".repeat(64) },
  imageHash = "c".repeat(64);
const vector = () => ({ ...identity, imageSha256: imageHash, vector: [1, ...Array(511).fill(0)] });
const rgb = () => ({
  schemaVersion: "native-reference-rgb-v1",
  imageSha256: imageHash,
  decoderPolicy: "imageio-oriented-fit-1024-srgb-rgb-v1",
  width: 1,
  height: 1,
  channels: 3,
  rgbBase64: "AQID",
});
test("separate vector checker rejects zero/nonfinite/wrong shape/resource joins", () => {
  assert.match(checkNativeVector(vector(), identity, imageHash), /^[a-f0-9]{64}$/u);
  for (const patch of [
    { vector: Array(512).fill(0) },
    { vector: Array(511).fill(1) },
    { vector: [NaN, ...Array(511).fill(0)] },
    { imageSha256: "d".repeat(64) },
    { encoderSha256: "d".repeat(64) },
  ])
    assert.throws(() => checkNativeVector({ ...vector(), ...patch }, identity, imageHash));
});
test("separate RGB checker rejects wrong byte counts, identities and codec policy", () => {
  checkNativeRgb(rgb(), imageHash);
  for (const patch of [
    { width: 1025 },
    { height: 0 },
    { rgbBase64: "AQI=" },
    { rgbBase64: "AQID\n" },
    { channels: 4 },
    { decoderPolicy: "sharp" },
    { imageSha256: "d".repeat(64) },
  ])
    assert.throws(() => checkNativeRgb({ ...rgb(), ...patch }, imageHash));
});
test("separate recount retains one-SKU scope and rejects a hidden control/old-correct loss", () => {
  const rows = Array.from({ length: 45 }, (_, i) => ({
    id: `r-${i}`,
    role: i < 12 ? "product" : "evaluation_negative",
    productId: i < 12 ? "one-sku" : undefined,
    result:
      i < 7
        ? { status: "candidate", productIds: ["one-sku"] }
        : { status: "unknown", productIds: [] },
  }));
  const prior = rows.slice(0, 7).map((r) => r.id);
  assert.equal(recountNativeMetrics(rows, prior).engineeringParityPassed, true);
  assert.deepEqual(recountNativeMetrics(rows, prior).agreementProducts, ["one-sku"]);
  rows[40].result = { status: "ambiguous", productIds: ["one-sku"] };
  assert.equal(recountNativeMetrics(rows, prior).engineeringParityPassed, false);
  rows[40].result = { status: "unknown", productIds: [] };
  rows[0].result = { status: "unknown", productIds: [] };
  assert.deepEqual(recountNativeMetrics(rows, prior).priorAgreementLosses, ["r-0"]);
  assert.throws(() => recountNativeMetrics(rows.slice(1), prior));
});
