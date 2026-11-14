// Synthetic native-port/mobile-adapter integration ONLY. No product accuracy.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "tsup";
import {
  checkedOutput,
  checkedWorkFile,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import {
  createPinnedLocalEmbeddingAdapter,
  verifyLocalEmbeddingAssets,
} from "./local-embedding-adapter.mjs";
import { loadPinnedReferenceDecoder } from "./pinned-reference-decoder.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ledger = "work/native-reference-port-smoke-v2-attempt.json";
const resource = "work/mobileclip-candidate-2026-11-06.M305AS/KierratysLocalVisionModels.bundle";
const predecessor = {
  protocol: {
    file: "work/native-reference-ports-2026-11-14.P5tYhw/smoke/protocol.json",
    sha256: "6ef9ec674e74fb4951f7f324f4474b2ba8c5aa855bb5b8d86c63f9a7fdcda1f1",
  },
  result: {
    file: "work/native-reference-ports-2026-11-14.P5tYhw/smoke/summary.json",
    sha256: "0e8f4e85e8de2e7440bfd61bdd384cf7ef25ffc288bc714cc8682b32903988cb",
  },
};
function sources() {
  const out = {};
  function visit(relative) {
    const file = path.join(root, relative),
      info = fs.lstatSync(file);
    assert.ok(!info.isSymbolicLink());
    if (info.isDirectory())
      for (const n of fs.readdirSync(file).sort()) visit(path.join(relative, n));
    else if (/\.(?:ts|swift|mjs|json)$/u.test(file))
      out[relative] = sha(readBounded(file, 2_000_000));
    assert.ok(Object.keys(out).length <= 512);
  }
  for (const dir of [
    "shared/domain/src",
    "shared/contracts/src",
    "mobile/app/src/features/local-vision",
    "mobile/app/modules/local-vision/ios",
    "scripts/qa/reference-image",
    "scripts/qa/local-vision",
  ]) {
    // Model source package is separately verified by the real predictor.
    if (dir.endsWith("/ios")) {
      for (const file of fs.readdirSync(path.join(root, dir)).filter((n) => n.endsWith(".swift")))
        visit(`${dir}/${file}`);
    } else visit(dir);
  }
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "docs/final/NATIVE_REFERENCE_PORTS_V2_PROTOCOL.md",
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
export async function runNativeReferenceSmoke(binaryArgument, outputArgument) {
  assert.ok(!fs.existsSync(path.join(root, ledger)), "native_reference_smoke_already_attempted");
  const binary = checkedWorkFile(binaryArgument, root),
    output = checkedOutput(outputArgument, root);
  const snapshot = sources(),
    binarySha256 = sha(readBounded(binary, 16_000_000)),
    decoder = loadPinnedReferenceDecoder(root);
  for (const pin of Object.values(predecessor))
    assert.equal(sha(readBounded(path.join(root, pin.file), 2_000_000)), pin.sha256);
  const prior = JSON.parse(readBounded(path.join(root, predecessor.protocol.file), 2_000_000));
  verifyLocalEmbeddingAssets(root);
  fs.mkdirSync(output, { mode: 0o700 });
  await build({
    entry: {
      runtime: path.join(root, "shared/domain/src/reference-vision.ts"),
      ports: path.join(root, "mobile/app/src/features/local-vision/reference-ports.ts"),
    },
    outDir: path.join(output, "js"),
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    bundle: true,
    splitting: false,
    noExternal: ["zod", /^@kierratysappi\//u],
    silent: true,
    clean: false,
  });
  const api = await import(pathToFileURL(path.join(output, "js/runtime.mjs")).href);
  const mobile = await import(pathToFileURL(path.join(output, "js/ports.mjs")).href);
  const jsPins = Object.fromEntries(
    ["runtime", "ports"].map((name) => [
      name,
      sha(readBounded(path.join(output, `js/${name}.mjs`), 4_000_000)),
    ]),
  );
  const encode = (data, quality, orientation = 1, width = 128, height = 128) =>
    decoder
      .sharp(data, { raw: { width, height, channels: 3 } })
      .withMetadata({ orientation })
      .jpeg({ quality })
      .toBuffer();
  const raw = texture(),
    images = [
      await encode(raw, 90),
      await encode(raw, 95),
      await encode(Buffer.alloc(128 * 128 * 3, 127), 90),
      await encode(raw, 85),
    ];
  const colours = [
    [220, 30, 30],
    [30, 200, 30],
    [30, 30, 220],
    [220, 200, 30],
  ];
  const quadrants = Buffer.alloc(128 * 80 * 3);
  for (let y = 0; y < 80; y++)
    for (let x = 0; x < 128; x++) {
      const colour = colours[(y < 40 ? 0 : 2) + (x < 64 ? 0 : 1)];
      for (let channel = 0; channel < 3; channel++)
        quadrants[(y * 128 + x) * 3 + channel] = colour[channel];
    }
  const orientations = await Promise.all(
    Array.from({ length: 8 }, (_, i) => encode(quadrants, 95, i + 1, 128, 80)),
  );
  const protocol = {
    schemaVersion: "native-reference-smoke-v2",
    sources: snapshot,
    binarySha256,
    jsPins,
    decoderPins: decoder.identity,
    decoderLockSha256: decoder.lockSha256,
    inputs: [...images, ...orientations].map((bytes, i) => ({
      index: i,
      bytes: bytes.length,
      imageSha256: sha(bytes),
    })),
    limits: { predictions: 6, modelLoads: 6, rgbDecodes: 11, hashCalls: 20, processes: 40 },
    predecessor,
    noProductAccuracyClaim: true,
    integrationAllowed: false,
  };
  assert.deepEqual(protocol.inputs, prior.inputs, "v2_input_change_forbidden");
  const lock = writeJsonExclusive(path.join(output, "protocol.json"), protocol, root);
  writeJsonExclusive(
    path.join(root, ledger),
    { protocolSha256: lock.sha256, output: path.relative(root, output) },
    root,
  );
  let processes = 0,
    hashes = 0,
    encodes = 0,
    decodes = 0,
    capabilities = 0,
    legacy;
  const embeddings = [],
    orientationResults = [];
  function check() {
    assert.deepEqual(sources(), snapshot);
    assert.equal(sha(readBounded(binary, 16_000_000)), binarySha256);
    for (const [name, hash] of Object.entries(jsPins))
      assert.equal(sha(readBounded(path.join(output, `js/${name}.mjs`), 4_000_000)), hash);
    verifyLocalEmbeddingAssets(root);
  }
  function run(command, base64 = "") {
    check();
    assert.ok(processes < 40, "process_budget");
    const index = processes++;
    writeJsonExclusive(
      path.join(output, `process-${index}-attempt.json`),
      {
        index,
        command,
        inputSha256: sha(Buffer.from(base64, "base64")),
        protocolSha256: lock.sha256,
      },
      root,
    );
    const call = spawnSync(binary, ["--resources", resource, command], {
      cwd: root,
      input: base64,
      encoding: "utf8",
      timeout: 20000,
      maxBuffer: 5_000_000,
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    });
    writeJsonExclusive(
      path.join(output, `process-${index}-result.json`),
      {
        status: call.status,
        signal: call.signal,
        stdout: call.stdout ?? "",
        stderr: call.stderr ?? "",
        transportError: call.error?.code ?? null,
      },
      root,
    );
    assert.equal(call.status, 0, "native_process_failed");
    return call.stdout.trim();
  }
  const reader = {
    async inspectReferenceCapabilities() {
      capabilities++;
      assert.equal(capabilities, 1);
      return run("--reference-capabilities");
    },
    async hashReferenceBytes(base64) {
      hashes++;
      assert.ok(hashes <= 20);
      return JSON.parse(run("--reference-hash-stdin", base64));
    },
    async encodeReferenceImage(base64) {
      assert.ok(encodes < 4);
      assert.equal(sha(Buffer.from(base64, "base64")), protocol.inputs[encodes].imageSha256);
      encodes++;
      const value = run("--reference-encode-stdin", base64);
      embeddings.push(JSON.parse(value));
      return value;
    },
    async decodeReferenceRgb(base64) {
      decodes++;
      assert.ok(decodes <= 11);
      return run("--reference-rgb-stdin", base64);
    },
  };
  let compilation = null,
    query = null,
    selfQuery = null,
    parity = null,
    failure = null;
  try {
    const availability = await mobile.createNativeReferenceRuntimePorts(() => reader);
    assert.equal(availability.status, "available");
    const manifest = {
      schemaVersion: "max-margin-runtime-manifest-v1",
      catalogueId: "native-synthetic-smoke",
      encoderSha256: availability.identity.encoderSha256,
      preprocessingSha256: availability.identity.preprocessingSha256,
      products: [{ productId: "synthetic-texture", label: "Generated texture, not a product" }],
      images: images.slice(0, 3).map((bytes, i) => ({
        imageId: `synthetic-${i}`,
        role: i < 2 ? "reference" : "calibration_negative",
        ...(i < 2 ? { productId: "synthetic-texture" } : {}),
        imageSha256: sha(bytes),
        source: {
          publisher: "Generated synthetic test only",
          url: "https://example.invalid/generated",
          licence: "GENERATED-TEST-ONLY",
          checkedOn: "2026-11-14",
          snapshotSha256: sha(`generated:${sha(bytes)}`),
          reviewStatus: "source_asserted_pending_review",
        },
      })),
    };
    writeJsonExclusive(path.join(output, "manifest.json"), manifest, root);
    const serialized = JSON.stringify(manifest);
    const compiled = await api.compileMaxMarginImageRuntime(
      serialized,
      manifest.images.map((row, i) => ({
        imageId: row.imageId,
        encoded: new Uint8Array(images[i]),
      })),
      availability.ports,
    );
    if (compiled.status !== "ready") {
      compilation = compiled;
      throw Error("runtime_compile_failed");
    }
    const { runtime, ...receipt } = compiled;
    compilation = receipt;
    assert.equal(compilation.catalogueSha256, sha(serialized));
    query = await runtime.identify(new Uint8Array(images[3]));
    assert.ok(["candidate", "ambiguous", "unknown"].includes(query.status));
    assert.equal(query.queryImageSha256, sha(images[3]));
    assert.equal(query.vectorSha256, sha(JSON.stringify(embeddings[3].vector)));
    assert.equal(query.integrationAllowed, false);
    if (query.status === "candidate") assert.deepEqual(query.productIds, ["synthetic-texture"]);
    selfQuery = await runtime.identify(new Uint8Array(images[0]));
    assert.equal(selfQuery.reason, "training_image");
    assert.equal(encodes, 4);
    assert.equal(decodes, 3);
    const adapter = createPinnedLocalEmbeddingAdapter(root);
    writeJsonExclusive(
      path.join(output, "legacy-attempt.json"),
      { querySha256: sha(images[3]), protocolSha256: lock.sha256 },
      root,
    );
    processes++;
    legacy = await adapter.encode(new Uint8Array(images[3]));
    writeJsonExclusive(path.join(output, "legacy-result.json"), legacy, root);
    assert.equal(legacy.status, "observed");
    const fit = legacy.observation.views[1].embedding,
      actual = embeddings[3].vector;
    const maxAbsoluteDifference = Math.max(...fit.map((v, i) => Math.abs(v - actual[i])));
    const cosine = fit.reduce((sum, v, i) => sum + v * actual[i], 0);
    parity = { maxAbsoluteDifference, cosine, distinctEncoderIdentity: true };
    assert.ok(maxAbsoluteDifference <= 1e-10 && cosine >= 0.999999999, "vector_parity_failed");
    const expected = [
      [0, 1, 2, 3],
      [1, 0, 3, 2],
      [3, 2, 1, 0],
      [2, 3, 0, 1],
      [0, 2, 1, 3],
      [2, 0, 3, 1],
      [3, 1, 2, 0],
      [1, 3, 0, 2],
    ];
    for (let i = 0; i < 8; i++) {
      const value = JSON.parse(await reader.decodeReferenceRgb(orientations[i].toString("base64")));
      const width = i < 4 ? 128 : 80,
        height = i < 4 ? 80 : 128;
      assert.equal(value.width, width);
      assert.equal(value.height, height);
      assert.equal(value.imageSha256, sha(orientations[i]));
      const data = Buffer.from(value.rgbBase64, "base64");
      assert.equal(data.length, width * height * 3);
      const corners = [
        [8, 8],
        [width - 9, 8],
        [8, height - 9],
        [width - 9, height - 9],
      ].map(([x, y]) => [...data.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)]);
      orientationResults.push({ orientation: i + 1, width, height, corners });
      for (let corner = 0; corner < 4; corner++)
        for (let channel = 0; channel < 3; channel++)
          assert.ok(
            Math.abs(corners[corner][channel] - colours[expected[i][corner]][channel]) <= 8,
            "orientation_corner_failed",
          );
    }
    assert.equal(decodes, 11);
    assert.equal(hashes, 17);
    assert.equal(processes, 34);
    check();
  } catch (error) {
    failure = { reason: error instanceof Error ? error.message : "failed" };
  }
  const summary = {
    schemaVersion: "native-reference-smoke-result-v2",
    status: failure ? "failed" : "passed",
    protocolSha256: lock.sha256,
    failure,
    compilation,
    query,
    selfQuery,
    parity,
    orientationResults,
    calls: {
      processes,
      hashes,
      encodes,
      decodes,
      capabilities,
      legacyPredictions: legacy?.status === "observed" ? 2 : 0,
    },
    noProductAccuracyClaim: true,
    noPhysicalDeviceClaim: true,
    integrationAllowed: false,
  };
  const result = writeJsonExclusive(path.join(output, "summary.json"), summary, root);
  process.stdout.write(
    `${JSON.stringify({
      status: summary.status,
      protocolSha256: lock.sha256,
      resultSha256: result.sha256,
      calls: summary.calls,
      failure,
    })}\n`,
  );
  if (failure) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], "--run");
  await runNativeReferenceSmoke(process.argv[3], process.argv[4]);
}
