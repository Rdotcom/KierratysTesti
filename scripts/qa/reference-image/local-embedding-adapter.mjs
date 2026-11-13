// Offline QA ONLY. Actual-byte bridge to the existing pinned two-view exporter.
// Uses the center view for retrieval; BOTH predictions remain in accounting.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { readBounded } from "../local-vision/embedding-control.mjs";
import { validateEmbeddingProgress } from "../local-vision/embedding-data.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const LOCAL_EMBEDDING_PINS = Object.freeze({
  binary: "work/embedding-native-2026-11-09.clmnxf/embedding-qa",
  binarySha256: "1c4e9c070a6ea969fabf81dc1f372f4b572dfb83237a4db54ba27113be6e29a5",
  source: "scripts/qa/local-vision/embedding-main.swift",
  sourceSha256: "904d18b29d37f6dcc5c86b1e7f84ed5d62fdf8a33f0b4d693f1952d59b9b69da",
  compiledSourceSha256: "f63a4484d8d9a63a3101f6b278df6fb56849c3901fac4822abfd1b7eb03f9099",
  model: "work/mobileclip-candidate-2026-11-06.M305AS/compiled/mobileclip_s0_image.mlmodelc",
  treeSha256: "8d6437b7a6add34c1a198e98b58c2059bc36573074cce49bfca82338a2f1d12b",
  prototypes: "work/mobileclip-candidate-2026-11-06.M305AS/prototypes.json",
  prototypesSha256: "0dfe73569d1b2177629d95c4bc21c1392be9228aff6809cab0ed1c3358893c81",
  weightSha256: "87d8f63997bbd2f38ba7defeaaa2c571928bdece56aa9629542198b3ce906ed6",
  graphSha256: "858f2fc75c7d7b2fd182c1a13ae099a3f66c16ba1d0ea72375a0cdf6fe97b984",
  promptsSha256: "aa726197e10fc1911b88bb6d6da099220339133c6e39e500f112b9077316e610",
  modelRevision: "55c8098c12ba8f928e37e26b2e1dd097777c3f98",
});
export const LOCAL_EMBEDDING_IDENTITY = Object.freeze({
  // Identity covers the executable, source, full compiled model and prototype
  // dependency, not just a caller's model name or the weight file alone.
  encoderSha256: sha(JSON.stringify(LOCAL_EMBEDDING_PINS)),
  preprocessingSha256: sha(
    "center-square-256-srgb-v1|l2-double-reduction-order-v1|final_emb_1|Float32|1,512",
  ),
});

export function verifyLocalEmbeddingAssets(root) {
  const p = LOCAL_EMBEDDING_PINS;
  assert.equal(sha(readBounded(path.join(root, p.binary), 16_000_000)), p.binarySha256);
  const source = readBounded(path.join(root, p.source), 1_000_000);
  assert.equal(sha(source), p.sourceSha256);
  // Commit0b75faf removed exactly one terminal LF after this binary was built.
  // Authenticate BOTH exact byte sequences; no generic trim/normalization waiver.
  assert.equal(sha(Buffer.concat([source, Buffer.from("\n")])), p.compiledSourceSha256);
  assert.equal(sha(readBounded(path.join(root, p.prototypes), 1_000_000)), p.prototypesSha256);
  const model = path.join(root, p.model),
    files = [];
  let total = 0,
    nodes = 0;
  function visit(directory, depth) {
    assert.ok(depth <= 8 && ++nodes <= 256, "model_tree_bound");
    assert.equal(fs.realpathSync(directory), directory, "linked_model_directory");
    const names = fs.readdirSync(directory).sort();
    assert.ok(names.length <= 200, "model_tree_bound");
    for (const name of names) {
      const file = path.join(directory, name),
        stat = fs.lstatSync(file);
      assert.ok(!stat.isSymbolicLink(), "linked_model_artifact");
      if (stat.isDirectory()) visit(file, depth + 1);
      else {
        assert.ok(files.length < 200 && stat.isFile(), "model_file_bound");
        const bytes = readBounded(file, 40_000_000);
        total += bytes.length;
        assert.ok(total <= 40_000_000, "model_bytes_bound");
        files.push([path.relative(model, file), sha(bytes)]);
      }
    }
  }
  visit(model, 0);
  assert.equal(sha(JSON.stringify(files)), p.treeSha256, "compiled_tree_drift");
  return LOCAL_EMBEDDING_IDENTITY;
}

/** Bounded subprocess transport. Deadline/abort kills the worker, but the
 * promise settles only on close; callers must retain their busy gate until then.
 * A stuck OS/process may delay close: this is not a hard real-time guarantee.
 */
export function runEmbeddingWorker(binary, args, input, { cwd, signal, timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    const started = performance.now(),
      chunks = { stdout: [], stderr: [] },
      sizes = { stdout: 0, stderr: 0 };
    let reason = null,
      child,
      timer;
    const result = (exitCode = null, processSignal = null) => ({
      exitCode,
      processSignal,
      reason,
      wallMs: Math.ceil(performance.now() - started),
      stdout: Buffer.concat(chunks.stdout).toString("utf8"),
      stderr: Buffer.concat(chunks.stderr).toString("utf8"),
    });
    if (signal?.aborted) {
      reason = "cancelled";
      resolve(result());
      return;
    }
    const stop = (why) => {
      reason ??= why;
      child?.kill("SIGKILL");
    };
    const abort = () => stop("cancelled");
    try {
      child = spawn(binary, args, {
        cwd,
        shell: false,
        env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      for (const stream of ["stdout", "stderr"])
        child[stream].on("data", (chunk) => {
          sizes[stream] += chunk.length;
          if (sizes[stream] > 524288) {
            stop("output_limit");
            return;
          }
          chunks[stream].push(chunk);
        });
      child.on("error", () => {
        reason ??= "spawn_failed";
      });
      child.stdin.on("error", () => {
        reason ??= "input_failed";
      });
      child.on("close", (code, sig) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        resolve(result(code, sig));
      });
      timer = setTimeout(() => stop("timeout"), timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      child.stdin.end(input);
    } catch {
      reason = "spawn_failed";
      if (child) stop(reason);
      else resolve(result());
    }
  });
}

function checkedObservation(call, imageSha256) {
  assert.ok(
    !call.reason && !call.processSignal && call.exitCode === 0 && call.wallMs <= 15000,
    "worker_failed",
  );
  assert.ok(Buffer.byteLength(call.stdout) <= 100000, "observation_bound");
  const value = JSON.parse(call.stdout),
    p = LOCAL_EMBEDDING_PINS;
  const progress = validateEmbeddingProgress(call.stderr, { allowPartial: false });
  assert.ok(progress.valid && progress.complete, "progress_incomplete");
  assert.deepEqual(value.counters, progress.lastCounters, "counter_mismatch");
  for (const [key, expected] of Object.entries({
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
    inputImageSha256: imageSha256,
  }))
    assert.equal(value[key], expected, "observation_identity_mismatch");
  assert.ok(
    Number.isInteger(value.durationMs) &&
      value.durationMs >= progress.lastDurationMs &&
      value.durationMs <= 12000,
    "late_observation",
  );
  assert.ok(Array.isArray(value.views) && value.views.length === 2, "incomplete_views");
  for (const [index, view] of value.views.entries()) {
    assert.equal(view.view, index === 0 ? "center" : "full-frame-aspect-fit");
    assert.equal(
      view.preprocessing,
      index === 0 ? "center-square-256-srgb-v1" : "aspect-fit-256-srgb-gray127-v1",
    );
    assert.equal(view.normalization, "l2-double-reduction-order-v1");
    assert.equal(view.outputFeature, "final_emb_1");
    assert.deepEqual(view.outputShape, [1, 512]);
    assert.equal(view.outputDataType, "Float32");
    assert.equal(view.embeddingDimension, 512);
    assert.ok(
      Array.isArray(view.embedding) &&
        view.embedding.length === 512 &&
        view.embedding.every(
          (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1.000001,
        ),
      "invalid_vector",
    );
    const norm = Math.sqrt(view.embedding.reduce((sum, n) => sum + n * n, 0));
    assert.ok(
      Math.abs(norm - 1) <= 1e-6 && Math.abs(norm - view.embeddingNorm) <= 1e-6,
      "invalid_norm",
    );
  }
  return value;
}

/** Trusted-port seam for synthetic regression doubles, never a production pin
 * override. Production factory below always supplies actual checks/transport. */
export function createEmbeddingByteAdapter({ verify, run }) {
  let busy = false;
  return Object.freeze({
    async encode(input, signal) {
      if (signal?.aborted) return { status: "unavailable", reason: "cancelled" };
      if (busy) return { status: "unavailable", reason: "busy" };
      // Reject subclasses/shared/resizable backing stores before copying.
      let bytes;
      try {
        assert.ok(input && Object.getPrototypeOf(input) === Uint8Array.prototype);
        const proto = Object.getPrototypeOf(Uint8Array.prototype);
        const get = (name) => Object.getOwnPropertyDescriptor(proto, name).get.call(input);
        const buffer = get("buffer"),
          length = get("byteLength"),
          offset = get("byteOffset");
        assert.ok(
          Object.getPrototypeOf(buffer) === ArrayBuffer.prototype &&
            !buffer.resizable &&
            length >= 12 &&
            length <= 1500000,
        );
        bytes = Buffer.from(new Uint8Array(buffer, offset, length));
        assert.ok(
          bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217,
        );
      } catch {
        return { status: "invalid", reason: "invalid_image" };
      }
      busy = true;
      let call;
      try {
        verify();
        if (signal?.aborted) return { status: "unavailable", reason: "cancelled" };
        const imageSha256 = sha(bytes);
        call = await run(bytes.toString("base64"), signal);
        // Check pins after process settlement even on cancellation/failure.
        verify();
        if (signal?.aborted || call.reason === "cancelled")
          return { status: "unavailable", reason: "cancelled", call };
        if (call.reason) return { status: "unavailable", reason: call.reason, call };
        const observation = checkedObservation(call, imageSha256);
        return {
          status: "observed",
          integrationAllowed: false,
          observation,
          call,
          receipt: {
            ...LOCAL_EMBEDDING_IDENTITY,
            imageSha256,
            vectorSha256: sha(JSON.stringify(observation.views[0].embedding)),
            vector: [...observation.views[0].embedding],
          },
        };
      } catch {
        return {
          status: "unavailable",
          reason: "integrity_or_worker_failure",
          ...(call ? { call } : {}),
        };
      } finally {
        busy = false;
      }
    },
  });
}

export function createPinnedLocalEmbeddingAdapter(root) {
  return createEmbeddingByteAdapter({
    verify: () => verifyLocalEmbeddingAssets(root),
    run: (input, signal) =>
      runEmbeddingWorker(
        path.join(root, LOCAL_EMBEDDING_PINS.binary),
        [
          "--export-views",
          path.join(root, LOCAL_EMBEDDING_PINS.model),
          path.join(root, LOCAL_EMBEDDING_PINS.prototypes),
        ],
        input,
        { cwd: root, signal },
      ),
  });
}
