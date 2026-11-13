import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { EMBEDDING_COUNTER_KEYS } from "../qa/local-vision/embedding-data.mjs";
import {
  createEmbeddingByteAdapter,
  LOCAL_EMBEDDING_IDENTITY,
  LOCAL_EMBEDDING_PINS,
  runEmbeddingWorker,
} from "../qa/reference-image/local-embedding-adapter.mjs";

// Synthetic fake JPEG signature and fake worker only. No real decode/prediction.
const image = () => Uint8Array.from([255, 216, 1, 2, 3, 4, 5, 6, 7, 8, 255, 217]);
const sha = (v) => createHash("sha256").update(v).digest("hex");
function callFor(bytes) {
  let counters = Object.fromEntries(EMBEDDING_COUNTER_KEYS.map((k) => [k, 0]));
  const steps = [
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
  const stderr = `${steps
    .map(([stage, change], i) => {
      counters = { ...counters, ...change };
      return JSON.stringify({
        schemaVersion: "mobileclip-s0-two-view-progress-v1",
        stage,
        durationMs: i + 1,
        counters,
      });
    })
    .join("\n")}\n`;
  const p = LOCAL_EMBEDDING_PINS;
  const value = {
    schemaVersion: "mobileclip-s0-two-view-embeddings-v1",
    status: "observed",
    modelId: "apple-mobileclip-s0-coreml-2024",
    modelRevision: p.modelRevision,
    imageWeightSha256: p.weightSha256,
    compiledGraphSha256: p.graphSha256,
    compiledTreeSha256: p.treeSha256,
    prototypesSha256: p.prototypesSha256,
    promptsSha256: p.promptsSha256,
    promptPolicy: "packaging-visible-form-v1",
    computeUnits: "cpuOnly",
    inputPolicy: "original-frozen-jpeg-base64-stdin-v1",
    inputImageSha256: sha(bytes),
    durationMs: 9,
    counters,
    views: [0, 1].map((index) => ({
      view: index === 0 ? "center" : "full-frame-aspect-fit",
      preprocessing: index === 0 ? "center-square-256-srgb-v1" : "aspect-fit-256-srgb-gray127-v1",
      normalization: "l2-double-reduction-order-v1",
      outputFeature: "final_emb_1",
      outputShape: [1, 512],
      outputDataType: "Float32",
      embeddingDimension: 512,
      embeddingNorm: 1,
      embedding: [1, ...Array(511).fill(0)],
    })),
  };
  return {
    exitCode: 0,
    processSignal: null,
    reason: null,
    wallMs: 10,
    stdout: JSON.stringify(value),
    stderr,
  };
}
const setup = (run = async (input) => callFor(Buffer.from(input, "base64")), verify = () => {}) =>
  createEmbeddingByteAdapter({ verify, run });
test("actual supplied bytes are snapshotted, hashed and passed as base64 without metadata IDs", async () => {
  let checks = 0,
    received;
  const result = await setup(
    async (input) => {
      received = input;
      return callFor(Buffer.from(input, "base64"));
    },
    () => checks++,
  ).encode(image());
  assert.equal(result.status, "observed");
  assert.equal(checks, 2);
  assert.equal(received, Buffer.from(image()).toString("base64"));
  assert.deepEqual(result.receipt, {
    ...LOCAL_EMBEDDING_IDENTITY,
    imageSha256: sha(image()),
    vectorSha256: sha(JSON.stringify([1, ...Array(511).fill(0)])),
    vector: [1, ...Array(511).fill(0)],
  });
  assert.equal(result.integrationAllowed, false);
  assert.equal(result.observation.counters.imagePredictionsCompleted, 2);
});
test("rejects invalid/subclass/shared/oversized images before verify or work", async () => {
  let calls = 0;
  const adapter = setup(
    async () => {
      calls++;
    },
    () => calls++,
  );
  for (const bytes of [
    null,
    {},
    new Uint8Array(0),
    new Uint8Array(1500001),
    Buffer.from(image()),
    new Uint8Array(new SharedArrayBuffer(12)),
    new Uint8Array(new ArrayBuffer(12, { maxByteLength: 24 })),
  ])
    assert.equal((await adapter.encode(bytes)).status, "invalid");
  assert.equal(calls, 0);
});
test("pre-aborted request never verifies or invokes worker", async () => {
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    (
      await setup(() => {
        throw Error("must_not_run");
      }).encode(image(), controller.signal)
    ).reason,
    "cancelled",
  );
});
test("failed preflight never invokes model", async () => {
  let calls = 0;
  const result = await setup(
    () => calls++,
    () => {
      throw Error("pin_drift");
    },
  ).encode(image());
  assert.equal(result.reason, "integrity_or_worker_failure");
  assert.equal(calls, 0);
});
test("postflight drift refuses observed vector and retains raw attempt evidence", async () => {
  let checks = 0;
  const result = await setup(undefined, () => {
    if (++checks === 2) throw Error("drift");
  }).encode(image());
  assert.equal(result.status, "unavailable");
  assert.ok(result.call.stdout);
  assert.equal(result.receipt, undefined);
});
test("busy gate remains held through cancelled work settlement, late success cannot surface", async () => {
  let complete;
  const gate = new Promise((resolve) => (complete = resolve)),
    controller = new AbortController();
  const adapter = setup(async () => {
    await gate;
    return callFor(image());
  });
  const pending = adapter.encode(image(), controller.signal);
  controller.abort();
  assert.equal((await adapter.encode(image())).reason, "busy");
  complete();
  assert.equal((await pending).reason, "cancelled");
  assert.equal((await adapter.encode(image())).status, "observed");
});
test("caller image mutation cannot alter pending snapshot or its hash", async () => {
  let complete;
  const gate = new Promise((resolve) => (complete = resolve)),
    bytes = image();
  const pending = setup(async (input) => {
    await gate;
    return callFor(Buffer.from(input, "base64"));
  }).encode(bytes);
  bytes.fill(0);
  complete();
  assert.equal((await pending).receipt.imageSha256, sha(image()));
});
for (const [label, edit] of [
  ["input hash", (v) => (v.inputImageSha256 = "0".repeat(64))],
  ["encoder", (v) => (v.imageWeightSha256 = "0".repeat(64))],
  ["preprocessing", (v) => (v.views[0].preprocessing = "other")],
  ["dimension", (v) => v.views[0].embedding.pop()],
  ["zero norm", (v) => v.views[0].embedding.fill(0)],
  ["missing view", (v) => v.views.pop()],
  ["late result", (v) => (v.durationMs = 12001)],
  ["counters", (v) => (v.counters.imagePredictionsCompleted = 1)],
])
  test(`rejects ${label} drift but retains worker evidence`, async () => {
    const result = await setup(async () => {
      const call = callFor(image()),
        v = JSON.parse(call.stdout);
      edit(v);
      call.stdout = JSON.stringify(v);
      return call;
    }).encode(image());
    assert.equal(result.status, "unavailable");
    assert.ok(result.call);
    assert.equal(result.receipt, undefined);
  });
test("deadline kills and closes real isolated child, without image/model work", async () => {
  const call = await runEmbeddingWorker(process.execPath, ["-e", "setInterval(()=>{},1000)"], "", {
    timeoutMs: 20,
  });
  assert.equal(call.reason, "timeout");
  assert.equal(call.processSignal, "SIGKILL");
});
test("cancellation closes real isolated child", async () => {
  const controller = new AbortController();
  const pending = runEmbeddingWorker(process.execPath, ["-e", "setInterval(()=>{},1000)"], "", {
    signal: controller.signal,
  });
  controller.abort();
  assert.equal((await pending).reason, "cancelled");
});
test("stdout flood is bounded and worker closed", async () => {
  const call = await runEmbeddingWorker(
    process.execPath,
    ["-e", "process.stdout.write('x'.repeat(600000));setInterval(()=>{},1000)"],
    "",
  );
  assert.equal(call.reason, "output_limit");
  assert.ok(Buffer.byteLength(call.stdout) <= 524288);
});
test("missing worker fails without leaking error text or environment", async () => {
  const call = await runEmbeddingWorker("/nonexistent-kig-embedding-worker", [], "");
  assert.equal(call.reason, "spawn_failed");
  assert.equal(call.stdout, "");
});
