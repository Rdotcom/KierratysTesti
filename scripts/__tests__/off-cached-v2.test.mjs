import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  EMBEDDING_COUNTER_KEYS,
  EMBEDDING_SOURCE_POLICY,
} from "../qa/local-vision/embedding-data.mjs";
import { GROUPS } from "../qa/local-vision/linear-data.mjs";
import {
  OFF_CACHED_V2_POLICY,
  readCachedPair,
} from "../qa/reference-image/evaluate-off-cached-v2.mjs";
import { LOCAL_EMBEDDING_IDENTITY } from "../qa/reference-image/local-embedding-adapter.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const imageSha = "a".repeat(64);
function fixture() {
  let counters = Object.fromEntries(EMBEDDING_COUNTER_KEYS.map((k) => [k, 0]));
  const stages = [
    ["model_load_started", { modelLoadsAttempted: 1 }],
    ["model_load_completed", { modelLoadsCompleted: 1 }],
    ["decode_started", { imageDecodesAttempted: 1 }],
    ["decode_completed", { imageDecodesCompleted: 1 }],
    ["center_prediction_started", { imagePredictionsAttempted: 1, centerPredictionsAttempted: 1 }],
    [
      "center_prediction_completed",
      { imagePredictionsCompleted: 1, centerPredictionsCompleted: 1 },
    ],
    ["fit_prediction_started", { imagePredictionsAttempted: 2, fitPredictionsAttempted: 1 }],
    ["fit_prediction_completed", { imagePredictionsCompleted: 2, fitPredictionsCompleted: 1 }],
  ];
  const stderr = `${stages
    .map(([stage, change], i) => {
      counters = { ...counters, ...change };
      return JSON.stringify({
        schemaVersion: EMBEDDING_SOURCE_POLICY.progressSchemaVersion,
        stage,
        durationMs: i + 1,
        counters,
      });
    })
    .join("\n")}\n`;
  const { progressSchemaVersion: _unused, ...policy } = EMBEDDING_SOURCE_POLICY;
  const raw = {
    ...policy,
    status: "observed",
    inputImageSha256: imageSha,
    durationMs: 9,
    counters,
    views: [0, 1].map((i) => ({
      view: i === 0 ? "center" : "full-frame-aspect-fit",
      preprocessing: i === 0 ? "center-square-256-srgb-v1" : "aspect-fit-256-srgb-gray127-v1",
      scorePolicy:
        i === 0 ? "legacy-center-unclamped-dot-v1" : "legacy-fit-roundoff-clamped-dot-v1",
      embeddingDimension: 512,
      normalization: "l2-double-reduction-order-v1",
      outputFeature: "final_emb_1",
      outputShape: [1, 512],
      outputDataType: "Float32",
      embedding: [1, ...Array(511).fill(0)],
      embeddingNorm: 1,
      scores: GROUPS.map((group) => ({ group, cosine: 0 })),
    })),
  };
  return {
    status: "observed",
    integrationAllowed: false,
    observation: raw,
    call: {
      exitCode: 0,
      reason: null,
      processSignal: null,
      wallMs: 10,
      stdout: JSON.stringify(raw),
      stderr,
    },
    receipt: {
      ...LOCAL_EMBEDDING_IDENTITY,
      imageSha256: imageSha,
      vectorSha256: sha(JSON.stringify(raw.views[0].embedding)),
      vector: raw.views[0].embedding,
    },
  };
}
test("validates both synthetic saved views without opening an image or running a model", () => {
  const result = readCachedPair(JSON.stringify(fixture()), imageSha);
  assert.equal(result.center.length, 512);
  assert.equal(result.fit.length, 512);
  assert.equal(result.counters.imagePredictionsCompleted, 2);
});
test("cached protocol keeps fixed gates and zero-image/model budgets", () => {
  assert.equal(OFF_CACHED_V2_POLICY.minimumCosine, 0.9);
  assert.equal(OFF_CACHED_V2_POLICY.minimumMargin, 0.08);
  assert.equal(OFF_CACHED_V2_POLICY.newModelCalls, 0);
  assert.equal(OFF_CACHED_V2_POLICY.newImageCalls, 0);
  assert.equal(OFF_CACHED_V2_POLICY.integrationAllowed, false);
  assert.equal(OFF_CACHED_V2_POLICY.maximumRetrievals, 24);
});
test("requires actual expected image binding and exact receipt hashes", () => {
  assert.throws(() => readCachedPair(JSON.stringify(fixture()), "b".repeat(64)));
  for (const edit of [
    (v) => (v.receipt.vectorSha256 = "0".repeat(64)),
    (v) => (v.receipt.encoderSha256 = "0".repeat(64)),
    (v) => (v.receipt.preprocessingSha256 = "0".repeat(64)),
  ]) {
    const value = fixture();
    edit(value);
    assert.throws(() => readCachedPair(JSON.stringify(value), imageSha));
  }
});
test("rejects raw/output or vector drift instead of silently repairing metadata", () => {
  const value = fixture();
  value.observation.durationMs = 10;
  assert.throws(() => readCachedPair(JSON.stringify(value), imageSha));
  const other = fixture();
  other.receipt.vector = [0, 1, ...Array(510).fill(0)];
  assert.throws(() => readCachedPair(JSON.stringify(other), imageSha));
});
test("rejects incomplete progress and worker failure without abstention substitution", () => {
  for (const edit of [
    (v) => (v.call.stderr = ""),
    (v) => (v.call.exitCode = 1),
    (v) => (v.call.reason = "timeout"),
    (v) => (v.status = "unavailable"),
  ]) {
    const value = fixture();
    edit(value);
    assert.throws(() => readCachedPair(JSON.stringify(value), imageSha));
  }
});
test("rejects a bad full-frame vector even if center remains valid", () => {
  for (const edit of [
    (v) => v.views[1].embedding.pop(),
    (v) => v.views[1].embedding.fill(0),
    (v) => (v.views[1].preprocessing = "center-square-256-srgb-v1"),
  ]) {
    const value = fixture();
    edit(value.observation);
    value.call.stdout = JSON.stringify(value.observation);
    assert.throws(() => readCachedPair(JSON.stringify(value), imageSha));
  }
});
test("bounds serialized cached data before reading caller getters", () => {
  for (const input of [
    null,
    "{",
    "x".repeat(256001),
    {
      get call() {
        throw Error("must_not_read");
      },
    },
  ])
    assert.throws(() => readCachedPair(input, imageSha));
});
