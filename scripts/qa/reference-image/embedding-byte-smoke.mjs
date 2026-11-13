// Explicit once-only integration smoke on generated textures, NOT product QA.
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
import { loadPinnedReferenceDecoder } from "./pinned-reference-decoder.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function sourcePins() {
  const pins = {};
  for (const directory of [
    "scripts/qa/reference-image",
    "scripts/qa/local-vision",
    "shared/domain/src",
  ])
    visit(path.join(root, directory));
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name),
        info = fs.lstatSync(file);
      assert.ok(!info.isSymbolicLink(), "linked_source");
      if (info.isDirectory()) visit(file);
      else if (/\.(?:mjs|ts|swift)$/u.test(name)) {
        assert.ok(Object.keys(pins).length < 256, "source_bound");
        pins[path.relative(root, file)] = sha(readBounded(file, 1_000_000));
      }
    }
  }
  return pins;
}

export async function runEmbeddingByteSmoke(argument) {
  const output = checkedOutput(argument, root);
  const sources = sourcePins(),
    identity = verifyLocalEmbeddingAssets(root);
  const decoder = loadPinnedReferenceDecoder(root);
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
  const engineFile = path.join(output, "engine/reference-vision.mjs");
  const engineHash = sha(readBounded(engineFile, 4_000_000));
  const engine = await import(pathToFileURL(engineFile).href);
  const pixels = Buffer.alloc(128 * 128 * 3);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 3;
      pixels[i] = (x * 13 + y * 7) % 256;
      pixels[i + 1] = (x * 3 + y * 17) % 256;
      pixels[i + 2] = (x * 19 + y * 11) % 256;
    }
  const images = [];
  for (const quality of [90, 95])
    images.push(
      new Uint8Array(
        await decoder
          .sharp(pixels, { raw: { width: 128, height: 128, channels: 3 } })
          .jpeg({ quality })
          .toBuffer(),
      ),
    );
  assert.notEqual(sha(images[0]), sha(images[1]));
  const protocol = {
    schemaVersion: "hybrid-byte-smoke-v1",
    sources,
    engineSha256: engineHash,
    decoderIdentity: decoder.identity,
    decoderLockSha256: decoder.lockSha256,
    encoderPins: LOCAL_EMBEDDING_PINS,
    identity,
    inputs: images.map((image, index) => ({ index, sha256: sha(image), bytes: image.length })),
    plannedProcesses: 2,
    plannedImageDecodes: 2,
    plannedImagePredictions: 4,
    plannedTextPredictions: 0,
    gallery: [0],
    query: 1,
    selectedView: "center",
    minimumCosine: 0.9,
    minimumMargin: 0.08,
    qualityClaimAllowed: false,
    independentCaptures: false,
    appIntegrationAllowed: false,
    stopOnRequiredFailure: true,
    noRetry: true,
  };
  const lock = writeJsonExclusive(path.join(output, "protocol.json"), protocol, root);
  assert.deepEqual(sourcePins(), sources);
  verifyLocalEmbeddingAssets(root);
  assert.equal(sha(readBounded(engineFile, 4_000_000)), engineHash);
  // Canonical once-only claim. Never remove/reset it or reacquire after failure.
  writeJsonExclusive(
    path.join(root, "work/hybrid-byte-adapter-smoke-v1.json"),
    { protocolSha256: lock.sha256, output: path.relative(root, output), plannedProcesses: 2 },
    root,
  );
  const adapter = createPinnedLocalEmbeddingAdapter(root),
    results = [];
  let failure = null;
  for (const [index, image] of images.entries()) {
    writeJsonExclusive(
      path.join(output, `attempt-${index}.json`),
      { index, imageSha256: sha(image), protocolSha256: lock.sha256 },
      root,
    );
    const result = await adapter.encode(image);
    results.push(result);
    writeJsonExclusive(path.join(output, `result-${index}.json`), result, root);
    if (result.status !== "observed") {
      failure = "required_encoding_failed";
      break;
    }
  }
  let comparison = null,
    selfQuery = null;
  if (!failure) {
    const first = results[0].receipt,
      second = results[1].receipt;
    const catalogueSha256 = sha(
      JSON.stringify([
        {
          referenceId: "synthetic-0",
          productId: "synthetic-texture",
          imageSha256: first.imageSha256,
        },
      ]),
    );
    const index = engine.createReferenceEmbeddingIndex(
      JSON.stringify({
        ...LOCAL_EMBEDDING_IDENTITY,
        catalogueSha256,
        minimumCosine: protocol.minimumCosine,
        minimumMargin: protocol.minimumMargin,
        references: [
          {
            referenceId: "synthetic-0",
            productId: "synthetic-texture",
            imageSha256: first.imageSha256,
            vector: first.vector,
          },
        ],
      }),
    );
    assert.equal(index.status, "ready");
    const q = (receipt) =>
      JSON.stringify({
        ...LOCAL_EMBEDDING_IDENTITY,
        catalogueSha256,
        imageSha256: receipt.imageSha256,
        vector: receipt.vector,
      });
    comparison = index.compare(q(second));
    selfQuery = index.compare(q(first));
    assert.ok(["candidate", "unknown", "ambiguous"].includes(comparison.status));
    assert.equal(comparison.integrationAllowed, false);
    assert.equal(selfQuery.reason, "enrollment_image");
  }
  assert.deepEqual(sourcePins(), sources);
  assert.equal(sha(readBounded(engineFile, 4_000_000)), engineHash);
  verifyLocalEmbeddingAssets(root);
  const summary = {
    schemaVersion: "hybrid-byte-smoke-result-v1",
    status: failure ? "failed" : "passed",
    failure,
    protocolSha256: lock.sha256,
    attemptedProcesses: results.length,
    observedProcesses: results.filter((r) => r.status === "observed").length,
    notAttempted: 2 - results.length,
    comparison,
    selfQuery,
    counterEvidence: results.every((r) => r.status === "observed")
      ? "exact_worker_footer"
      : "inspect_raw_results_and_progress_lower_bounds",
    imagePredictionsCompleted: results
      .filter((r) => r.status === "observed")
      .reduce((sum, r) => sum + r.observation.counters.imagePredictionsCompleted, 0),
    qualityClaimAllowed: false,
    appIntegrationAllowed: false,
  };
  const saved = writeJsonExclusive(path.join(output, "summary.json"), summary, root);
  return {
    status: summary.status,
    summarySha256: saved.sha256,
    output: path.relative(root, output),
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, "output_required");
  console.log(JSON.stringify(await runEmbeddingByteSmoke(process.argv[2])));
}
