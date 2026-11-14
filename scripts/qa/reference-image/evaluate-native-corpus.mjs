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
import { loadNativeCorpus, summarizeNativeCorpus } from "./native-corpus-data.mjs";
import { createNativeCorpusTransport, NATIVE_CORPUS_LIMITS } from "./native-corpus-transport.mjs";

const rootDefault = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ledger = "work/native-reference-corpus-v1-attempt.json";
const resource = "work/mobileclip-candidate-2026-11-06.M305AS/KierratysLocalVisionModels.bundle";
const nativeIdentity = {
  encoderSha256: "d12ec18cf58e3aed230f565ae9f2c79bd34cc35d347c8970b82209029a8fdfc4",
  preprocessingSha256: "2abfc997802d44d10758eecf5e633638d517b984d8de7a032aea079f2c1326d7",
};
const modelFiles = {
  "mobileclip-source-spec.bin": "2c1afa132c41c6535817cc67894bd7484bc2cbd084ed5e2f12b24f611af17591",
  "mobileclip-source-manifest.bin":
    "fe07dde983dae92c1799132816ce55f9ff8487f2681b530abf7222025aa27fa4",
  "mobileclip-prototypes.bin": "0dfe73569d1b2177629d95c4bc21c1392be9228aff6809cab0ed1c3358893c81",
  "mobileclip_s0_image.mlmodelc/model.mil":
    "858f2fc75c7d7b2fd182c1a13ae099a3f66c16ba1d0ea72375a0cdf6fe97b984",
  "mobileclip_s0_image.mlmodelc/weights/weight.bin":
    "87d8f63997bbd2f38ba7defeaaa2c571928bdece56aa9629542198b3ce906ed6",
};
function sources(root) {
  const out = {};
  function visit(relative) {
    const file = path.join(root, relative),
      info = fs.lstatSync(file);
    assert.ok(!info.isSymbolicLink(), "linked_source");
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
    "scripts/qa/reference-image",
    "scripts/qa/local-vision",
  ])
    visit(dir);
  for (const file of [
    "local-vision-engine.swift",
    "local-vision-module.swift",
    "mobileclip-predictor.swift",
  ])
    visit(`mobile/app/modules/local-vision/ios/${file}`);
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "docs/final/NATIVE_CORPUS_PROTOCOL.md",
    "scripts/__tests__/native-corpus.test.mjs",
  ])
    out[file] = sha(readBounded(path.join(root, file), 2_000_000));
  return out;
}
function resources(root) {
  const out = {};
  for (const [relative, digest] of Object.entries(modelFiles)) {
    const file = path.posix.join(resource, relative);
    assert.equal(
      sha(readBounded(checkedWorkFile(file, root), 24_000_000)),
      digest,
      "model_resource_drift",
    );
    out[file] = digest;
  }
  const notices = "mobile/app/modules/local-vision/ios/Resources/Notices";
  for (const n of fs.readdirSync(path.join(root, notices)).sort()) {
    assert.match(n, /^[a-z0-9-]+\.txt$/u);
    const bytes = readBounded(path.join(root, notices, n), 1_000_000),
      file = `${resource}/Notices/${n}`;
    assert.deepEqual(readBounded(checkedWorkFile(file, root), 1_000_000), bytes);
    out[`${notices}/${n}`] = sha(bytes);
    out[file] = sha(bytes);
  }
  const tree = [],
    compiled = `${resource}/mobileclip_s0_image.mlmodelc`;
  let treeBytes = 0;
  function visit(relative = "") {
    const directory = checkedWorkFile(path.posix.join(compiled, relative), root, true);
    for (const name of fs.readdirSync(directory).sort()) {
      const inner = path.posix.join(relative, name),
        file = path.posix.join(compiled, inner);
      const info = fs.lstatSync(path.join(root, file));
      assert.ok(!info.isSymbolicLink(), "linked_model_tree");
      if (info.isDirectory()) {
        assert.ok(inner.split("/").length <= 8);
        visit(inner);
      } else {
        const bytes = readBounded(checkedWorkFile(file, root), 24_000_000);
        treeBytes += bytes.length;
        assert.ok(tree.length < 200 && treeBytes <= 40_000_000);
        const digest = sha(bytes);
        tree.push([inner, digest]);
        out[file] = digest;
      }
    }
  }
  visit();
  assert.equal(
    sha(JSON.stringify(tree)),
    "8d6437b7a6add34c1a198e98b58c2059bc36573074cce49bfca82338a2f1d12b",
    "compiled_tree_drift",
  );
  assert.equal(Object.keys(out).length, 16);
  return out;
}
export async function freezeNativeCorpus(binaryArgument, outputArgument, root = rootDefault) {
  assert.ok(!fs.existsSync(path.join(root, ledger)), "native_corpus_already_attempted");
  const binary = checkedWorkFile(binaryArgument, root),
    output = checkedOutput(outputArgument, root);
  const data = loadNativeCorpus(root),
    snapshot = sources(root),
    resourcePins = resources(root);
  const training = data.rows.filter((r) => ["reference", "calibration_only"].includes(r.role));
  const manifest = {
    schemaVersion: "max-margin-runtime-manifest-v1",
    catalogueId: "source-labelled-native-corpus-v1",
    ...nativeIdentity,
    products: data.allocation.enrolledProductIds.map((id) => ({
      productId: id,
      label: training.find((r) => r.productId === id).label,
    })),
    images: training.map((row) => ({
      imageId: row.id,
      role: row.role === "reference" ? "reference" : "calibration_negative",
      ...(row.role === "reference" ? { productId: row.productId } : {}),
      imageSha256: row.imageSha256,
      source: row.source,
    })),
  };
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
  const jsPins = Object.fromEntries(
    ["runtime", "ports"].map((name) => {
      const file = path.relative(root, path.join(output, `js/${name}.mjs`));
      return [file, sha(readBounded(path.join(root, file), 4_000_000))];
    }),
  );
  assert.deepEqual(sources(root), snapshot);
  const saved = writeJsonExclusive(
    path.join(output, "lock.json"),
    {
      schemaVersion: "native-corpus-lock-v1",
      sources: snapshot,
      resourcePins,
      inputPins: data.files,
      binary: path.relative(root, binary),
      binarySha256: sha(readBounded(binary, 16_000_000)),
      jsPins,
      manifest,
      serializedManifestSha256: sha(JSON.stringify(manifest)),
      rows: data.rows,
      previousAgreements: data.previousAgreements,
      limits: NATIVE_CORPUS_LIMITS,
      node: process.version,
      platform: process.platform,
      imageCallsBeforeLock: 0,
      independentAccuracyEstablished: false,
      integrationAllowed: false,
    },
    root,
  );
  return { lock: path.relative(root, saved.path), sha256: saved.sha256 };
}

export async function runNativeCorpus(
  lockArgument,
  lockSha256,
  outputArgument,
  root = rootDefault,
) {
  assert.ok(!fs.existsSync(path.join(root, ledger)), "native_corpus_already_attempted");
  const bytes = readBounded(checkedWorkFile(lockArgument, root), 4_000_000);
  assert.equal(sha(bytes), lockSha256);
  const lock = JSON.parse(bytes),
    output = checkedOutput(outputArgument, root);
  assert.equal(lock.schemaVersion, "native-corpus-lock-v1");
  assert.deepEqual(lock.limits, NATIVE_CORPUS_LIMITS);
  assert.equal(lock.node, process.version);
  assert.equal(lock.platform, process.platform);
  const check = () => {
    assert.deepEqual(sources(root), lock.sources);
    assert.deepEqual(resources(root), lock.resourcePins);
    const current = loadNativeCorpus(root);
    assert.deepEqual(current.files, lock.inputPins);
    assert.deepEqual(current.rows, lock.rows);
    assert.deepEqual(current.previousAgreements, lock.previousAgreements);
    assert.equal(
      sha(readBounded(checkedWorkFile(lock.binary, root), 16_000_000)),
      lock.binarySha256,
    );
    for (const [file, digest] of Object.entries(lock.jsPins))
      assert.equal(sha(readBounded(checkedWorkFile(file, root), 4_000_000)), digest);
    assert.equal(sha(JSON.stringify(lock.manifest)), lock.serializedManifestSha256);
  };
  check();
  writeJsonExclusive(
    path.join(root, ledger),
    { lockSha256, output: path.relative(root, output), limits: lock.limits },
    root,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  const transport = createNativeCorpusTransport({
    root,
    binary: path.join(root, lock.binary),
    resource,
    output,
    lockSha256,
  });
  const reader = {
    inspectReferenceCapabilities: () => transport.call("capabilities"),
    hashReferenceBytes: async (base64) => JSON.parse(await transport.call("hashes", base64)),
    encodeReferenceImage: (base64) => transport.call("encodes", base64),
    decodeReferenceRgb: (base64) => transport.call("decodes", base64),
  };
  const api = await import(
    pathToFileURL(
      path.join(
        root,
        Object.keys(lock.jsPins).find((f) => f.endsWith("runtime.mjs")),
      ),
    ).href
  );
  const mobile = await import(
    pathToFileURL(
      path.join(
        root,
        Object.keys(lock.jsPins).find((f) => f.endsWith("ports.mjs")),
      ),
    ).href
  );
  const queries = lock.rows.filter((r) => !["reference", "calibration_only"].includes(r.role));
  const observations = queries.map((r) => ({
    id: r.id,
    role: r.role,
    ...(r.productId ? { productId: r.productId } : {}),
    imageSha256: r.imageSha256,
    result: null,
  }));
  const training = lock.rows.filter((r) => ["reference", "calibration_only"].includes(r.role));
  let compilation = null,
    failure = null;
  const started = performance.now();
  try {
    const availability = await mobile.createNativeReferenceRuntimePorts(() => reader);
    assert.equal(availability.status, "available", "native_capability_failure");
    assert.equal(availability.identity.encoderSha256, nativeIdentity.encoderSha256);
    const compiled = await api.compileMaxMarginImageRuntime(
      JSON.stringify(lock.manifest),
      training.map((r) => ({
        imageId: r.id,
        encoded: new Uint8Array(readBounded(checkedWorkFile(r.file, root), 1_500_000)),
      })),
      availability.ports,
    );
    if (compiled.status !== "ready") {
      compilation = compiled;
      throw Error("runtime_compile_failed");
    }
    const { runtime, ...receipt } = compiled;
    compilation = receipt;
    assert.equal(receipt.catalogueSha256, lock.serializedManifestSha256);
    process.stdout.write(
      `${JSON.stringify({ stage: "compiled", references: receipt.referenceCount, calibration: receipt.calibrationCount })}\n`,
    );
    for (let i = 0; i < queries.length; i++) {
      const row = queries[i];
      const result = await runtime.identify(
        new Uint8Array(readBounded(checkedWorkFile(row.file, root), 1_500_000)),
      );
      observations[i].result = result;
      writeJsonExclusive(path.join(output, `query-${i}.json`), observations[i], root);
      assert.ok(
        ["candidate", "ambiguous", "unknown"].includes(result.status),
        "required_query_failure",
      );
      assert.equal(result.queryImageSha256, row.imageSha256);
      assert.equal(result.integrationAllowed, false);
      process.stdout.write(
        `${JSON.stringify({ stage: "query", ordinal: i + 1, planned: queries.length, status: result.status })}\n`,
      );
    }
    assert.deepEqual(transport.counters, {
      capabilities: 1,
      hashes: 333,
      encodes: 93,
      decodes: 53,
      processes: 480,
    });
  } catch (error) {
    failure = { reason: error instanceof Error ? error.message : "failed" };
  }
  try {
    check();
  } catch {
    failure ??= { reason: "post_run_pin_failure" };
  }
  const metrics = summarizeNativeCorpus(observations, lock.previousAgreements);
  const saved = writeJsonExclusive(
    path.join(output, "summary.json"),
    {
      schemaVersion: "native-corpus-result-v1",
      lockSha256,
      status: failure
        ? "incomplete"
        : metrics.engineeringParityPassed
          ? "passed"
          : "quality_gate_failed",
      failure,
      compilation,
      metrics,
      rows: observations,
      calls: transport.counters,
      wallMs: Math.ceil(performance.now() - started),
      scope: "seen_source_ai_development_not_independent_or_phone_accuracy",
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
    calls: transport.counters,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const result =
    args.length === 3 && args[0] === "--freeze"
      ? await freezeNativeCorpus(args[1], args[2])
      : args.length === 4 && args[0] === "--run"
        ? await runNativeCorpus(args[1], args[2], args[3])
        : null;
  assert.ok(result, "use --freeze binary work/new OR --run lock sha work/new");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
