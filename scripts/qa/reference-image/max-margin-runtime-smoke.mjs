// Once-only byte/runtime integration on generated JPEGs. NOT product quality QA.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "tsup";
import {
  checkedOutput,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import {
  createPinnedLocalEmbeddingAdapter,
  LOCAL_EMBEDDING_IDENTITY,
  LOCAL_EMBEDDING_PINS,
  verifyLocalEmbeddingAssets,
} from "./local-embedding-adapter.mjs";
import { createNodeReferencePorts } from "./node-runtime-ports.mjs";
import { loadPinnedReferenceDecoder } from "./pinned-reference-decoder.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ledger = "work/max-margin-runtime-smoke-v1-attempt.json";
function sources() {
  const out = {};
  function visit(relative) {
    const file = path.join(root, relative),
      info = fs.lstatSync(file);
    assert.ok(!info.isSymbolicLink());
    if (info.isDirectory())
      for (const n of fs.readdirSync(file).sort()) visit(path.join(relative, n));
    else if (/\.(?:ts|mjs|swift|json)$/u.test(file)) {
      assert.ok(Object.keys(out).length < 256);
      out[relative] = sha(readBounded(file, 2_000_000));
    }
  }
  for (const dir of ["shared/domain/src", "scripts/qa/reference-image", "scripts/qa/local-vision"])
    visit(dir);
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "scripts/qa/protocols/max-margin-runtime-protocol.md",
  ])
    out[file] = sha(readBounded(path.join(root, file), 2_000_000));
  return out;
}
function texture() {
  let state = 17;
  const cells = Array.from({ length: 256 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 30 + (state % 190);
  });
  const data = Buffer.alloc(128 * 128 * 3);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++)
      data.fill(
        cells[Math.floor(y / 8) * 16 + Math.floor(x / 8)],
        (y * 128 + x) * 3,
        (y * 128 + x) * 3 + 3,
      );
  return data;
}
export async function runMaxMarginRuntimeSmoke(argument) {
  assert.ok(!fs.existsSync(path.join(root, ledger)), "runtime_smoke_already_attempted");
  const output = checkedOutput(argument, root),
    snapshot = sources(),
    decoder = loadPinnedReferenceDecoder(root);
  verifyLocalEmbeddingAssets(root);
  fs.mkdirSync(output, { mode: 0o700 });
  await build({
    entry: [path.join(root, "shared/domain/src/reference-vision.ts")],
    outDir: path.join(output, "engine"),
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    bundle: true,
    splitting: false,
    noExternal: ["zod"],
    silent: true,
    clean: false,
  });
  const engineFile = path.join(output, "engine/reference-vision.mjs"),
    engineSha256 = sha(readBounded(engineFile, 4_000_000));
  const api = await import(pathToFileURL(engineFile).href),
    rgb = texture(),
    encode = async (data, quality) =>
      new Uint8Array(
        await decoder
          .sharp(data, { raw: { width: 128, height: 128, channels: 3 } })
          .jpeg({ quality })
          .toBuffer(),
      );
  const images = [
    await encode(rgb, 90),
    await encode(rgb, 95),
    await encode(Buffer.alloc(128 * 128 * 3, 127), 90),
    await encode(rgb, 85),
  ];
  assert.equal(new Set(images.map(sha)).size, 4);
  const preprocessingSha256 = sha(
    "aspect-fit-256-srgb-gray127-v1|l2-double-reduction-order-v1|final_emb_1|Float32|1,512",
  );
  const manifest = {
    schemaVersion: "max-margin-runtime-manifest-v1",
    catalogueId: "synthetic-runtime-smoke",
    encoderSha256: LOCAL_EMBEDDING_IDENTITY.encoderSha256,
    preprocessingSha256,
    products: [
      { productId: "synthetic-texture", label: "Generated synthetic texture, not a real product" },
    ],
    images: images.slice(0, 3).map((bytes, index) => ({
      imageId: `synthetic-${index}`,
      role: index < 2 ? "reference" : "calibration_negative",
      ...(index < 2 ? { productId: "synthetic-texture" } : {}),
      imageSha256: sha(bytes),
      source: {
        publisher: "Generated synthetic QA only",
        url: "https://example.invalid/generated-fixture",
        licence: "GENERATED-SYNTHETIC-TEST-ONLY",
        checkedOn: "2026-11-14",
        snapshotSha256: sha(`synthetic-fixture:${sha(bytes)}`),
        reviewStatus: "source_asserted_pending_review",
      },
    })),
  };
  const serialized = JSON.stringify(manifest),
    protocol = {
      schemaVersion: "max-margin-byte-smoke-v1",
      sources: snapshot,
      engineSha256,
      manifest,
      decoderIdentity: decoder.identity,
      decoderLockSha256: decoder.lockSha256,
      encoderPins: LOCAL_EMBEDDING_PINS,
      inputs: images.map((bytes, index) => ({
        index,
        imageSha256: sha(bytes),
        bytes: bytes.length,
      })),
      plannedNativeProcesses: 4,
      plannedNativeImagePredictions: 8,
      plannedPixelDecodes: 3,
      plannedRuntimeHashCalls: 10,
      noProductQualityClaim: true,
      humanAccepted: false,
      integrationAllowed: false,
    };
  const lock = writeJsonExclusive(path.join(output, "protocol.json"), protocol, root);
  const check = () => {
    assert.deepEqual(sources(), snapshot);
    assert.equal(sha(readBounded(engineFile, 4_000_000)), engineSha256);
    verifyLocalEmbeddingAssets(root);
  };
  check();
  writeJsonExclusive(
    path.join(root, ledger),
    {
      protocolSha256: lock.sha256,
      output: path.relative(root, output),
      processBudget: 4,
      predictionBudget: 8,
    },
    root,
  );
  const adapter = createPinnedLocalEmbeddingAdapter(root),
    actual = createNodeReferencePorts(decoder.sharp),
    calls = { hashes: 0, encodes: 0, decodes: 0 },
    observations = [];
  const ports = {
    async sha256(bytes) {
      calls.hashes++;
      return sha(bytes);
    },
    async encode(bytes, signal) {
      const index = calls.encodes;
      assert.ok(index < 4, "process_budget");
      assert.equal(sha(bytes), protocol.inputs[index].imageSha256, "unexpected_image_or_order");
      writeJsonExclusive(
        path.join(output, `native-${index}-attempt.json`),
        { ordinal: index, inputImageSha256: sha(bytes), protocolSha256: lock.sha256 },
        root,
      );
      calls.encodes++;
      const result = await adapter.encode(bytes, signal);
      observations.push(result);
      writeJsonExclusive(path.join(output, `native-${index}-result.json`), result, root);
      if (result.status !== "observed") throw Error("required_native_failure");
      assert.equal(result.observation.views[1].preprocessing, "aspect-fit-256-srgb-gray127-v1");
      return JSON.stringify({
        imageSha256: result.receipt.imageSha256,
        encoderSha256: result.receipt.encoderSha256,
        preprocessingSha256,
        vector: result.observation.views[1].embedding,
      });
    },
    async decodeRgb(bytes, limits) {
      calls.decodes++;
      return actual.decodeRgb(bytes, limits);
    },
  };
  let compilation = null,
    query = null,
    selfQuery = null,
    failure = null;
  try {
    const compiled = await api.compileMaxMarginImageRuntime(
      serialized,
      manifest.images.map((row, index) => ({ imageId: row.imageId, encoded: images[index] })),
      ports,
    );
    if (compiled.status !== "ready") {
      compilation = compiled;
      throw Error("required_compile_failure");
    }
    const { runtime, ...receipt } = compiled;
    compilation = receipt;
    assert.equal(compiled.catalogueSha256, sha(serialized));
    query = await runtime.identify(images[3]);
    assert.ok(["candidate", "unknown", "ambiguous"].includes(query.status), "query_must_complete");
    assert.equal(query.queryImageSha256, sha(images[3]));
    assert.equal(
      query.vectorSha256,
      sha(JSON.stringify(observations[3].observation.views[1].embedding)),
    );
    assert.equal(query.integrationAllowed, false);
    if (query.status === "candidate") assert.deepEqual(query.productIds, ["synthetic-texture"]);
    selfQuery = await runtime.identify(images[0]);
    assert.equal(selfQuery.reason, "training_image");
    assert.deepEqual(calls, { hashes: 10, encodes: 4, decodes: 3 });
  } catch (error) {
    failure = { reason: error instanceof Error ? error.message : "runtime_smoke_failure" };
  }
  check();
  const summary = {
    schemaVersion: "max-margin-byte-smoke-result-v1",
    status: failure ? "failed" : "passed",
    protocolSha256: lock.sha256,
    failure,
    compilation,
    query,
    selfQuery,
    calls,
    nativeObserved: observations.filter((r) => r.status === "observed").length,
    completedNativePredictionsLowerBound: observations
      .filter((r) => r.status === "observed")
      .reduce((n, r) => n + r.observation.counters.imagePredictionsCompleted, 0),
    notAttemptedNativeProcesses: 4 - calls.encodes,
    counterEvidence: observations.every((r) => r.status === "observed")
      ? "observed_worker_footers"
      : "inspect_raw_failures_and_progress_lower_bounds",
    productQualityEstablished: false,
    independentAccuracyEstablished: false,
    integrationAllowed: false,
  };
  const saved = writeJsonExclusive(path.join(output, "summary.json"), summary, root);
  return {
    status: summary.status,
    sha256: saved.sha256,
    output: path.relative(root, output),
    calls,
    failure,
    queryStatus: query?.status ?? null,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, "new_output_required");
  console.log(JSON.stringify(await runMaxMarginRuntimeSmoke(process.argv[2])));
}
