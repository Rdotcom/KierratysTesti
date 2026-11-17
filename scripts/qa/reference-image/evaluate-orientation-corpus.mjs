// Bound four-view experiment, preserving every old call and failed quality result.
import assert from "node:assert/strict";
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
import { summarizeExpandedCorpus } from "./evaluate-expanded-corpus.mjs";
import { loadPinnedReferenceDecoder } from "./pinned-reference-decoder.mjs";
import {
  claimOrientationCorpusCall,
  createOrientationCorpusTransport,
  ORIENTATION_CORPUS_LIMITS,
} from "./native-corpus-transport.mjs";
const rootDefault = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const parentFile = "work/expanded-native-2026-11-14.jNduPd/continuation-freeze/lock.json",
  parentSha = "efdf65ee638595cedc176029138194afc8e10b20920ad0003c897c7444dfa67e";
const resultFile = "work/expanded-native-2026-11-14.jNduPd/continuation-result/summary.json",
  resultSha = "ebbf42e7591dba4f924954160bb1529a78ded04bed059b16cc42e94617145761";
const prepareLedger = "work/orientation-reference-v1-prepare.json",
  runLedger = "work/orientation-reference-v1-attempt.json";
const resource = "work/mobileclip-candidate-2026-11-06.M305AS/KierratysLocalVisionModels.bundle";
const fitRoles = ["reference", "calibration_negative"],
  queryRoles = ["product_query", "safety_audit"];
function pinned(file, digest, root, max = 24_000_000) {
  const target = file.startsWith("work/") ? checkedWorkFile(file, root) : path.join(root, file),
    b = readBounded(target, max);
  assert.equal(sha(b), digest, "input_drift");
  return b;
}
function parents(root) {
  const parent = JSON.parse(pinned(parentFile, parentSha, root)),
    result = JSON.parse(pinned(resultFile, resultSha, root));
  assert.equal(result.failure, null);
  assert.equal(result.status, "quality_gate_failed");
  for (const pins of [
    parent.inputPins,
    parent.resourcePins,
    parent.jsPins,
    parent.continuation.pins,
    { [parent.binary]: parent.binarySha256 },
  ])
    for (const [f, h] of Object.entries(pins)) pinned(f, h, root);
  const sources = {};
  for (const [f, h] of Object.entries(parent.sources)) {
    const b = readBounded(path.join(root, f), 4_000_000);
    sources[f] = sha(b);
    if (
      ![
        "shared/domain/src/reference-vision.ts",
        "scripts/qa/reference-image/native-corpus-transport.mjs",
      ].includes(f)
    )
      assert.equal(sources[f], h, "unexpected_parent_source_drift");
  }
  for (const f of [
    "shared/domain/src/reference-orientation-consensus.ts",
    "shared/domain/src/__tests__/reference-orientation-consensus.test.ts",
    "scripts/qa/reference-image/evaluate-orientation-corpus.mjs",
    "scripts/__tests__/orientation-corpus.test.mjs",
    "scripts/qa/protocols/orientation-recognition-protocol.md",
  ])
    sources[f] = sha(readBounded(path.join(root, f), 4_000_000));
  const inputPins = {
    [parentFile]: parentSha,
    [resultFile]: resultSha,
    ...parent.inputPins,
    ...parent.continuation.pins,
  };
  const dir = path.posix.dirname(resultFile);
  for (let i = 0; i < 538; i++) {
    const directory = i < 274 ? parent.continuation.directory : dir;
    const a = `${directory}/process-${i}-attempt.json`,
      r = `${directory}/process-${i}-result.json`;
    for (const f of [a, r, `${directory}/process-${i}.stdout`, `${directory}/process-${i}.stderr`])
      inputPins[f] = sha(readBounded(checkedWorkFile(f, root), 4_300_000));
    const attempt = JSON.parse(pinned(a, inputPins[a], root)),
      receipt = JSON.parse(pinned(r, inputPins[r], root));
    assert.equal(attempt.index, i);
    assert.equal(receipt.index, i);
    assert.equal(receipt.status, 0);
    assert.equal(receipt.reason, null);
    assert.equal(attempt.lockSha256, i < 274 ? parent.continuation.parentSha256 : parentSha);
    for (const stream of ["stdout", "stderr"]) {
      assert.equal(receipt[stream].file, `${directory}/process-${i}.${stream}`);
      assert.equal(inputPins[receipt[stream].file], receipt[stream].sha256);
    }
  }
  return { parent, result, sources, inputPins };
}
export function validateOrientationVariants(rows, queries) {
  assert.equal(rows.length, 174);
  assert.equal(queries.length, 58);
  assert.equal(new Set(rows.map((r) => `${r.id}:${r.rotation}`)).size, 174);
  for (const q of queries) {
    const views = rows.filter((r) => r.id === q.id);
    assert.deepEqual(
      views.map((r) => r.rotation).sort((a, b) => a - b),
      [90, 180, 270],
    );
    assert.ok(views.every((r) => r.originalImageSha256 === q.imageSha256));
    for (const v of views) {
      assert.match(v.imageSha256, /^[a-f0-9]{64}$/u);
      assert.ok(v.bytes > 0 && v.bytes <= 1_500_000);
    }
  }
}
export async function freezeOrientationCorpus(outputArgument, root = rootDefault) {
  assert.ok(!fs.existsSync(path.join(root, prepareLedger)), "orientation_already_prepared");
  const output = checkedOutput(outputArgument, root),
    data = parents(root),
    decoder = loadPinnedReferenceDecoder(root);
  const queries = data.parent.rows.filter((r) => queryRoles.includes(r.allocationRole));
  fs.mkdirSync(output, { mode: 0o700 });
  const before = writeJsonExclusive(
    path.join(output, "protocol.json"),
    {
      sources: data.sources,
      inputPins: data.inputPins,
      decoderLockSha256: decoder.lockSha256,
      rotations: [90, 180, 270],
      modelCalls: 0,
      limits: ORIENTATION_CORPUS_LIMITS,
    },
    root,
  );
  writeJsonExclusive(
    path.join(root, prepareLedger),
    { protocolSha256: before.sha256, output: path.relative(root, output) },
    root,
  );
  const variants = [];
  for (const q of queries)
    for (const rotation of [90, 180, 270]) {
      const b = pinned(q.file, q.imageSha256, root, 1_500_000);
      const image = await decoder
        .sharp(b, { limitInputPixels: 16_000_000, failOn: "warning", animated: false })
        .autoOrient()
        .rotate(rotation)
        .toColourspace("srgb")
        .flatten({ background: "#ffffff" })
        .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 95 })
        .toBuffer();
      assert.ok(image.length > 0 && image.length <= 1_500_000);
      const f = checkedOutput(path.join(output, `${q.id}-${rotation}.jpg`), root);
      fs.writeFileSync(f, image, { flag: "wx", mode: 0o600 });
      variants.push({
        id: q.id,
        rotation,
        originalImageSha256: q.imageSha256,
        file: path.relative(root, f),
        imageSha256: sha(image),
        bytes: image.length,
      });
    }
  validateOrientationVariants(variants, queries);
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
  const jsPins = Object.fromEntries(
    ["runtime", "ports"].map((n) => {
      const f = path.relative(root, path.join(output, `js/${n}.mjs`));
      return [f, sha(readBounded(path.join(root, f), 4_000_000))];
    }),
  );
  assert.deepEqual(parents(root), data);
  loadPinnedReferenceDecoder(root);
  const saved = writeJsonExclusive(
    path.join(output, "lock.json"),
    {
      schemaVersion: "orientation-corpus-lock-v1",
      ...data,
      variants,
      jsPins,
      protocolSha256: before.sha256,
      limits: ORIENTATION_CORPUS_LIMITS,
      node: process.version,
      integrationAllowed: false,
    },
    root,
  );
  return {
    lock: path.relative(root, saved.path),
    sha256: saved.sha256,
    variants: variants.length,
    modelCalls: 0,
  };
}
export async function runOrientationCorpus(lockFile, lockHash, outputArgument, root = rootDefault) {
  assert.ok(!fs.existsSync(path.join(root, runLedger)), "orientation_already_attempted");
  const lock = JSON.parse(pinned(lockFile, lockHash, root, 8_000_000)),
    output = checkedOutput(outputArgument, root);
  assert.equal(lock.schemaVersion, "orientation-corpus-lock-v1");
  assert.deepEqual(lock.limits, ORIENTATION_CORPUS_LIMITS);
  assert.equal(lock.node, process.version);
  const check = () => {
    const p = parents(root);
    for (const k of ["sources", "inputPins", "parent", "result"]) assert.deepEqual(p[k], lock[k]);
    for (const [f, h] of Object.entries(lock.jsPins)) pinned(f, h, root);
    for (const v of lock.variants) pinned(v.file, v.imageSha256, root, 1_500_000);
  };
  check();
  writeJsonExclusive(
    path.join(root, runLedger),
    { lockSha256: lockHash, output: path.relative(root, output), limits: lock.limits },
    root,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  const base = createOrientationCorpusTransport({
    root,
    binary: path.join(root, lock.parent.binary),
    resource,
    output,
    lockSha256: lockHash,
  });
  const transport = {
    counters: base.counters,
    async call(kind, base64 = "") {
      const i = base.counters.processes;
      if (i >= 538) return base.call(kind, base64);
      const dir = i < 274 ? lock.parent.continuation.directory : path.posix.dirname(resultFile),
        f = `${dir}/process-${i}-attempt.json`,
        r = `${dir}/process-${i}-result.json`;
      const a = JSON.parse(pinned(f, lock.inputPins[f], root)),
        receipt = JSON.parse(pinned(r, lock.inputPins[r], root));
      assert.equal(a.kind, kind);
      assert.equal(a.inputSha256, sha(Buffer.from(base64, "base64")));
      assert.equal(a.command, claimOrientationCorpusCall(base.counters, kind));
      return pinned(receipt.stdout.file, lock.inputPins[receipt.stdout.file], root, 4_300_000)
        .toString("utf8")
        .trim();
    },
  };
  const api = await import(
      pathToFileURL(
        path.join(
          root,
          Object.keys(lock.jsPins).find((f) => f.endsWith("runtime.mjs")),
        ),
      ).href
    ),
    mobile = await import(
      pathToFileURL(
        path.join(
          root,
          Object.keys(lock.jsPins).find((f) => f.endsWith("ports.mjs")),
        ),
      ).href
    );
  const reader = {
    inspectReferenceCapabilities: () => transport.call("capabilities"),
    hashReferenceBytes: async (b) => JSON.parse(await transport.call("hashes", b)),
    encodeReferenceImage: (b) => transport.call("encodes", b),
    decodeReferenceRgb: (b) => transport.call("decodes", b),
  };
  const queries = lock.parent.rows.filter((r) => queryRoles.includes(r.allocationRole)),
    records = queries.map((q) => ({
      id: q.id,
      allocationRole: q.allocationRole,
      ...(q.productId ? { productId: q.productId } : {}),
      views: [],
      result: null,
    }));
  let failure = null;
  try {
    const available = await mobile.createNativeReferenceRuntimePorts(() => reader);
    assert.equal(available.status, "available");
    const compiled = await api.compileMaxMarginImageRuntime(
      JSON.stringify(lock.parent.manifest),
      lock.parent.rows
        .filter((r) => fitRoles.includes(r.allocationRole))
        .map((r) => ({
          imageId: r.id,
          encoded: new Uint8Array(pinned(r.file, r.imageSha256, root, 1_500_000)),
        })),
      available.ports,
    );
    assert.equal(compiled.status, "ready");
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i],
        result = await compiled.runtime.identify(
          new Uint8Array(pinned(q.file, q.imageSha256, root, 1_500_000)),
        );
      assert.deepEqual(result, lock.result.rows[i].result, "zero_degree_baseline_changed");
      records[i].views.push({ rotation: 0, result });
    }
    assert.equal(base.counters.processes, 538);
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      for (const v of lock.variants.filter((r) => r.id === q.id)) {
        const result = await compiled.runtime.identify(
          new Uint8Array(pinned(v.file, v.imageSha256, root, 1_500_000)),
        );
        records[i].views.push({ rotation: v.rotation, result });
        writeJsonExclusive(
          path.join(output, `view-${i}-${v.rotation}.json`),
          { id: q.id, originalImageSha256: q.imageSha256, ...v, result },
          root,
        );
        assert.ok(
          ["candidate", "ambiguous", "unknown"].includes(result.status),
          "required_view_failure",
        );
        assert.equal(result.queryImageSha256, v.imageSha256);
      }
      const manifest = lock.parent.manifest;
      records[i].result = api.fuseReferenceOrientations(
        JSON.stringify({
          originalImageSha256: q.imageSha256,
          catalogueSha256: lock.parent.serializedManifestSha256,
          encoderSha256: manifest.encoderSha256,
          preprocessingSha256: manifest.preprocessingSha256,
          enrolledProductIds: manifest.products.map((p) => p.productId),
          views: records[i].views.map(({ rotation, result }) => ({
            rotation,
            status: result.status,
            productIds: result.productIds,
            queryImageSha256: result.queryImageSha256,
            catalogueSha256: result.catalogueSha256,
            encoderSha256: result.encoderSha256,
            preprocessingSha256: result.preprocessingSha256,
          })),
        }),
      );
      writeJsonExclusive(path.join(output, `query-${i}.json`), records[i], root);
      process.stdout.write(
        `${JSON.stringify({ query: i + 1, planned: 58, status: records[i].result.status })}\n`,
      );
    }
    assert.deepEqual(
      base.counters,
      Object.fromEntries(
        ["capabilities", "hashes", "encodes", "decodes", "processes"].map((k) => [
          k,
          ORIENTATION_CORPUS_LIMITS[k],
        ]),
      ),
    );
  } catch (error) {
    failure = { reason: error instanceof Error ? error.message : "failed" };
  }
  try {
    check();
  } catch {
    failure ??= { reason: "post_run_pin_drift" };
  }
  const metrics = summarizeExpandedCorpus(
    records,
    lock.parent.previousAgreements,
    lock.parent.pilots,
  );
  const saved = writeJsonExclusive(
    path.join(output, "summary.json"),
    {
      schemaVersion: "orientation-corpus-result-v1",
      lockSha256: lockHash,
      status: failure ? "incomplete" : metrics.qualityGatePassed ? "passed" : "quality_gate_failed",
      failure,
      metrics,
      rows: records,
      calls: base.counters,
      replayedOperations: 538,
      newOperations: base.counters.processes - 538,
      independentAccuracyEstablished: false,
      integrationAllowed: false,
    },
    root,
  );
  return {
    summary: path.relative(root, saved.path),
    sha256: saved.sha256,
    metrics,
    failure,
    calls: base.counters,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const result =
    a.length === 2 && a[0] === "--freeze"
      ? await freezeOrientationCorpus(a[1])
      : a.length === 4 && a[0] === "--run"
        ? await runOrientationCorpus(a[1], a[2], a[3])
        : null;
  assert.ok(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
