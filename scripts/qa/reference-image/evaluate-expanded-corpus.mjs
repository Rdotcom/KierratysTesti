// Actual shipping-port experiment. No network or caller-provided feature vectors.
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
import { validateExpandedAllocation, EXPANDED_ALLOCATION } from "./allocate-expanded-corpus.mjs";
import {
  createExpandedCorpusTransport,
  EXPANDED_CORPUS_LIMITS,
} from "./native-corpus-transport.mjs";
import {
  createContinuationTransport,
  loadContinuation,
  queryObservation,
} from "./expanded-continuation.mjs";

const rootDefault = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const allocationFile = "work/off-expansion-2026-11-14.KK6s7m/allocation/allocation.json";
const allocationSha256 = "34a9964c4623c1d04aa73c2c9f08f4068155e36866ce820a92e06066a2ace08c";
const ledger = "work/expanded-native-corpus-v1-attempt.json";
const continuationLedger = "work/expanded-native-corpus-v2-attempt.json";
const resource = "work/mobileclip-candidate-2026-11-06.M305AS/KierratysLocalVisionModels.bundle";
const identity = {
  encoderSha256: "d12ec18cf58e3aed230f565ae9f2c79bd34cc35d347c8970b82209029a8fdfc4",
  preprocessingSha256: "2abfc997802d44d10758eecf5e633638d517b984d8de7a032aea079f2c1326d7",
};
const fitRoles = ["reference", "calibration_negative"];
const queryRoles = ["product_query", "safety_audit"];
export const EXPANDED_QUALITY_GATES = Object.freeze({
  minimumAgreements: 14,
  productQueries: 17,
  safetyAudits: 41,
  queries: 58,
});

export function summarizeExpandedCorpus(rows, previousAgreements, pilots = EXPANDED_ALLOCATION) {
  assert.equal(rows.length, 58, "all_query_denominators_required");
  assert.equal(new Set(rows.map((r) => r.id)).size, 58, "duplicate_query");
  const products = rows.filter((r) => r.allocationRole === "product_query"),
    audits = rows.filter((r) => r.allocationRole === "safety_audit");
  assert.equal(products.length, 17);
  assert.equal(audits.length, 41);
  assert.equal(pilots.length, 5);
  assert.equal(new Set(pilots.map((p) => p.productId)).size, 5);
  const agrees = (r) =>
    r.result?.status === "candidate" &&
    Array.isArray(r.result.productIds) &&
    r.result.productIds.length === 1 &&
    r.result.productIds[0] === r.productId;
  const agreements = products.filter(agrees),
    wrongs = products.filter((r) => r.result?.status === "candidate" && !agrees(r)),
    losses = previousAgreements.filter((id) => !products.some((r) => r.id === id && agrees(r))),
    missingPilots = pilots.filter(
      (p) =>
        !products.some((r) => r.id === p.pilotQuery && r.productId === p.productId && agrees(r)),
    ),
    nonUnknown = audits.filter((r) => r.result?.status !== "unknown"),
    failures = rows.filter(
      (r) => !["candidate", "ambiguous", "unknown"].includes(r.result?.status),
    );
  return {
    planned: 58,
    productQueries: 17,
    safetyAudits: 41,
    sourceAgreements: agreements.length,
    sourceDisagreements: wrongs.length,
    ambiguous: products.filter((r) => r.result?.status === "ambiguous").length,
    unknown: products.filter((r) => r.result?.status === "unknown").length,
    perProduct: pilots.map((p) => ({
      productId: p.productId,
      planned: products.filter((r) => r.productId === p.productId).length,
      agreements: agreements.filter((r) => r.productId === p.productId).length,
      pilotAgrees: !missingPilots.includes(p),
    })),
    agreementIds: agreements.map((r) => r.id),
    disagreementIds: wrongs.map((r) => r.id),
    priorAgreementLosses: losses,
    missingPilotIds: missingPilots.map((p) => p.pilotQuery),
    safetyNonUnknowns: nonUnknown.map((r) => ({
      id: r.id,
      status: r.result?.status ?? "not_attempted",
    })),
    failures: failures.map((r) => r.id),
    qualityGatePassed:
      agreements.length >= EXPANDED_QUALITY_GATES.minimumAgreements &&
      !wrongs.length &&
      !losses.length &&
      !missingPilots.length &&
      !nonUnknown.length &&
      !failures.length,
    independentAccuracyEstablished: false,
    integrationAllowed: false,
  };
}
function snapshot(root) {
  const pins = {};
  const visit = (file) => {
    const info = fs.lstatSync(path.join(root, file));
    assert.ok(!info.isSymbolicLink());
    if (info.isDirectory())
      for (const n of fs.readdirSync(path.join(root, file)).sort()) visit(`${file}/${n}`);
    else if (/\.(?:ts|swift|mjs|json)$/u.test(file))
      pins[file] = sha(readBounded(path.join(root, file), 2_000_000));
    assert.ok(Object.keys(pins).length <= 512);
  };
  for (const dir of [
    "shared/domain/src",
    "shared/contracts/src",
    "mobile/app/src/features/local-vision",
    "scripts/qa/reference-image",
    "scripts/qa/local-vision",
  ])
    visit(dir);
  for (const file of fs
    .readdirSync(path.join(root, "mobile/app/modules/local-vision/ios"))
    .filter((n) => n.endsWith(".swift")))
    visit(`mobile/app/modules/local-vision/ios/${file}`);
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    "scripts/__tests__/expanded-corpus.test.mjs",
    "scripts/qa/protocols/expanded-recognition-protocol.md",
    "scripts/qa/protocols/expanded-recognition-continuation.md",
  ])
    pins[file] = sha(readBounded(path.join(root, file), 2_000_000));
  return pins;
}
export function expandedInputPath(file, root) {
  if (file === "scripts/qa/protocols/off-expansion-visual-review.json")
    return path.join(root, file);
  return checkedWorkFile(file, root);
}
function pinnedBytes(file, digest, root, maximum = 4_000_000) {
  const b = readBounded(expandedInputPath(file, root), maximum);
  assert.equal(sha(b), digest, "pinned_input_drift");
  return b;
}
function loadAllocation(root) {
  const allocation = JSON.parse(pinnedBytes(allocationFile, allocationSha256, root));
  assert.equal(allocation.status, "ready_for_frozen_recognition_protocol");
  const protocolFile = path.posix.join(path.posix.dirname(allocationFile), "protocol.json"),
    protocol = JSON.parse(pinnedBytes(protocolFile, allocation.protocolSha256, root));
  for (const [f, h] of Object.entries(protocol.sources))
    assert.equal(sha(readBounded(path.join(root, f), 2_000_000)), h, "allocation_source_drift");
  for (const [f, h] of Object.entries(protocol.dataPins)) pinnedBytes(f, h, root);
  const old = JSON.parse(
    pinnedBytes(allocation.preservedBenchmark.lock, allocation.preservedBenchmark.lockSha256, root),
  );
  validateExpandedAllocation(
    allocation.rows,
    allocation.selection,
    old.rows.filter((r) => !["reference", "calibration_only"].includes(r.role)),
  );
  assert.deepEqual(allocation.selection, EXPANDED_ALLOCATION);
  assert.deepEqual(allocation.pixelAliases, []);
  assert.equal(Object.keys(old.resourcePins).length, 16);
  for (const [f, h] of Object.entries(old.resourcePins)) {
    const b = f.startsWith("work/")
      ? readBounded(checkedWorkFile(f, root), 24_000_000)
      : readBounded(path.join(root, f), 1_000_000);
    assert.equal(sha(b), h, "resource_drift");
  }
  return {
    allocation,
    resourcePins: old.resourcePins,
    inputPins: {
      ...protocol.dataPins,
      [allocationFile]: allocationSha256,
      [protocolFile]: allocation.protocolSha256,
    },
  };
}
export async function freezeExpandedCorpus(
  binaryArgument,
  outputArgument,
  root = rootDefault,
  continuationMode = false,
) {
  const stageLedger = continuationMode ? continuationLedger : ledger;
  assert.ok(!fs.existsSync(path.join(root, stageLedger)), "expanded_corpus_already_attempted");
  const binary = checkedWorkFile(binaryArgument, root),
    output = checkedOutput(outputArgument, root),
    data = loadAllocation(root),
    sources = snapshot(root);
  const training = data.allocation.rows.filter((r) => fitRoles.includes(r.allocationRole));
  const manifest = {
    schemaVersion: "max-margin-runtime-manifest-v1",
    catalogueId: "source-expanded-five-sku-v1",
    ...identity,
    products: EXPANDED_ALLOCATION.map((p) => ({
      productId: p.productId,
      label: data.allocation.rows.find((r) => r.productId === p.productId && r.label).label,
    })),
    images: training.map((r) => ({
      imageId: r.id,
      role: r.allocationRole,
      ...(r.allocationRole === "reference" ? { productId: r.productId } : {}),
      imageSha256: r.imageSha256,
      source: r.source,
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
    ["runtime", "ports"].map((n) => {
      const f = path.relative(root, path.join(output, `js/${n}.mjs`));
      return [f, sha(readBounded(path.join(root, f), 4_000_000))];
    }),
  );
  const continuation = continuationMode ? loadContinuation(root) : null;
  if (continuation) {
    for (const [f, h] of Object.entries(continuation.parent.sources)) {
      if (
        ![
          "scripts/qa/reference-image/evaluate-expanded-corpus.mjs",
          "scripts/__tests__/expanded-corpus.test.mjs",
        ].includes(f)
      )
        assert.equal(sources[f], h, "parent_source_drift");
    }
    assert.equal(sha(readBounded(binary, 16_000_000)), continuation.parent.binarySha256);
    assert.deepEqual(Object.values(jsPins), Object.values(continuation.parent.jsPins));
    assert.deepEqual(manifest, continuation.parent.manifest);
  }
  assert.deepEqual(snapshot(root), sources);
  const saved = writeJsonExclusive(
    path.join(output, "lock.json"),
    {
      schemaVersion: continuationMode ? "expanded-corpus-lock-v2" : "expanded-corpus-lock-v1",
      continuation,
      sources,
      inputPins: data.inputPins,
      resourcePins: data.resourcePins,
      binary: path.relative(root, binary),
      binarySha256: sha(readBounded(binary, 16_000_000)),
      jsPins,
      manifest,
      serializedManifestSha256: sha(JSON.stringify(manifest)),
      rows: data.allocation.rows,
      pilots: EXPANDED_ALLOCATION,
      previousAgreements: data.allocation.preservedBenchmark.previousAgreements,
      gates: EXPANDED_QUALITY_GATES,
      limits: EXPANDED_CORPUS_LIMITS,
      node: process.version,
      platform: process.platform,
      modelCallsBeforeLock: 0,
      integrationAllowed: false,
    },
    root,
  );
  return { lock: path.relative(root, saved.path), sha256: saved.sha256 };
}
export async function runExpandedCorpus(
  lockArgument,
  lockSha256,
  outputArgument,
  root = rootDefault,
  continuationMode = false,
) {
  const stageLedger = continuationMode ? continuationLedger : ledger;
  assert.ok(!fs.existsSync(path.join(root, stageLedger)), "expanded_corpus_already_attempted");
  const lock = JSON.parse(pinnedBytes(lockArgument, lockSha256, root)),
    output = checkedOutput(outputArgument, root);
  assert.equal(
    lock.schemaVersion,
    continuationMode ? "expanded-corpus-lock-v2" : "expanded-corpus-lock-v1",
  );
  assert.deepEqual(lock.gates, EXPANDED_QUALITY_GATES);
  assert.deepEqual(lock.limits, EXPANDED_CORPUS_LIMITS);
  assert.equal(lock.node, process.version);
  assert.equal(lock.platform, process.platform);
  const check = () => {
    assert.deepEqual(snapshot(root), lock.sources);
    const data = loadAllocation(root);
    assert.deepEqual(data.inputPins, lock.inputPins);
    assert.deepEqual(data.resourcePins, lock.resourcePins);
    assert.deepEqual(data.allocation.rows, lock.rows);
    assert.deepEqual(data.allocation.selection, lock.pilots);
    assert.deepEqual(
      data.allocation.preservedBenchmark.previousAgreements,
      lock.previousAgreements,
    );
    pinnedBytes(lock.binary, lock.binarySha256, root, 16_000_000);
    for (const [f, h] of Object.entries(lock.jsPins)) pinnedBytes(f, h, root);
    assert.equal(sha(JSON.stringify(lock.manifest)), lock.serializedManifestSha256);
    if (continuationMode) assert.deepEqual(loadContinuation(root), lock.continuation);
  };
  check();
  writeJsonExclusive(
    path.join(root, stageLedger),
    { lockSha256, output: path.relative(root, output), limits: lock.limits },
    root,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  const transportOptions = {
    root,
    binary: path.join(root, lock.binary),
    resource,
    output,
    lockSha256,
  };
  const transport = continuationMode
    ? createContinuationTransport(transportOptions, lock.continuation)
    : createExpandedCorpusTransport(transportOptions);
  const reader = {
    inspectReferenceCapabilities: () => transport.call("capabilities"),
    hashReferenceBytes: async (b) => JSON.parse(await transport.call("hashes", b)),
    encodeReferenceImage: (b) => transport.call("encodes", b),
    decodeReferenceRgb: (b) => transport.call("decodes", b),
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
  const queries = lock.rows.filter((r) => queryRoles.includes(r.allocationRole));
  const observations = queries.map(queryObservation);
  let compilation = null,
    failure = null;
  const started = performance.now();
  try {
    const availability = await mobile.createNativeReferenceRuntimePorts(() => reader);
    assert.equal(availability.status, "available", "native_capability_failure");
    assert.equal(availability.identity.encoderSha256, identity.encoderSha256);
    assert.equal(availability.identity.preprocessingSha256, identity.preprocessingSha256);
    const compiled = await api.compileMaxMarginImageRuntime(
      JSON.stringify(lock.manifest),
      lock.rows
        .filter((r) => fitRoles.includes(r.allocationRole))
        .map((r) => ({
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
      const r = queries[i],
        result = await runtime.identify(
          new Uint8Array(readBounded(checkedWorkFile(r.file, root), 1_500_000)),
        );
      observations[i].result = result;
      if (continuationMode && i < lock.continuation.priorQueries)
        assert.deepEqual(
          observations[i],
          JSON.parse(
            readBounded(
              checkedWorkFile(`${lock.continuation.directory}/query-${i}.json`, root),
              4_000_000,
            ),
          ),
          "prior_query_changed",
        );
      writeJsonExclusive(path.join(output, `query-${i}.json`), observations[i], root);
      assert.ok(
        ["candidate", "ambiguous", "unknown"].includes(result.status),
        "required_query_failure",
      );
      assert.equal(result.queryImageSha256, r.imageSha256);
      assert.equal(result.integrationAllowed, false);
      process.stdout.write(
        `${JSON.stringify({ stage: "query", ordinal: i + 1, planned: 58, status: result.status })}\n`,
      );
    }
    assert.deepEqual(
      transport.counters,
      Object.fromEntries(
        ["capabilities", "hashes", "encodes", "decodes", "processes"].map((k) => [
          k,
          EXPANDED_CORPUS_LIMITS[k],
        ]),
      ),
    );
  } catch (error) {
    failure = { reason: error instanceof Error ? error.message : "failed" };
  }
  try {
    check();
  } catch {
    failure ??= { reason: "post_run_pin_failure" };
  }
  const metrics = summarizeExpandedCorpus(observations, lock.previousAgreements, lock.pilots);
  const saved = writeJsonExclusive(
    path.join(output, "summary.json"),
    {
      schemaVersion: continuationMode ? "expanded-corpus-result-v2" : "expanded-corpus-result-v1",
      lockSha256,
      status: failure ? "incomplete" : metrics.qualityGatePassed ? "passed" : "quality_gate_failed",
      failure,
      compilation,
      metrics,
      rows: observations,
      calls: transport.counters,
      replayedNativeOperations: continuationMode ? lock.continuation.prefixProcesses : 0,
      newNativeOperations:
        transport.counters.processes - (continuationMode ? lock.continuation.prefixProcesses : 0),
      wallMs: Math.ceil(performance.now() - started),
      scope: "source_asserted_four_new_pilots_one_seen_not_independent_or_phone_accuracy",
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
  const a = process.argv.slice(2);
  const result =
    a.length === 3 && a[0] === "--freeze-v2"
      ? await freezeExpandedCorpus(a[1], a[2], rootDefault, true)
      : a.length === 4 && a[0] === "--run-v2"
        ? await runExpandedCorpus(a[1], a[2], a[3], rootDefault, true)
        : a.length === 3 && a[0] === "--freeze"
          ? await freezeExpandedCorpus(a[1], a[2])
          : a.length === 4 && a[0] === "--run"
            ? await runExpandedCorpus(a[1], a[2], a[3])
            : null;
  assert.ok(result, "use --freeze binary work/new OR --run lock sha work/new");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
