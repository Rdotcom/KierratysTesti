// Cached DEVELOPMENT ONLY. No image, encoder, network, training or native work.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
import { decodeEmbeddingPair } from "../local-vision/embedding-data.mjs";
import { summarizeHybridRows } from "./evaluate-off-hybrid.mjs";
import { LOCAL_EMBEDDING_IDENTITY, LOCAL_EMBEDDING_PINS } from "./local-embedding-adapter.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parent = "work/off-hybrid-2026-11-13.AL8bSt/";
const priorLockSha = "591a126ec901d37bc87c4f61fbb0854811c0ad4f10533f93e5638ccf770c8b9d";
const priorResultSha = "dfa2bbad747cc430935647b1dc84519afd8c976dab73563c2d1aab7c5795f912";
const priorCommit = "acca46dac735df3cae18d66a28f268814f504fed";
const ledger = "work/off-cached-monotone-v2-attempt.json";
export const OFF_CACHED_V2_POLICY = Object.freeze({
  id: "off-cached-monotone-v2",
  minimumCosine: 0.9,
  minimumMargin: 0.08,
  registeredArms: [
    "center-v1-stored",
    "center-monotone-v2",
    "fit-embedding-only",
    "fit-monotone-v2",
  ],
  maximumRetrievals: 24,
  maximumV2Fusions: 24,
  newImageCalls: 0,
  newModelCalls: 0,
  selection: "no_deployment_or_winner_selection_from_seen_results",
  independentAccuracyEstablished: false,
  integrationAllowed: false,
});

/** Strict computational-envelope validation. Score reference fields below only
 * check self-consistency of this saved observation, NOT independent score parity.
 * Freeze bytes before any new retrieval or fusion, never derive query labels. */
export function readCachedPair(serialized, imageSha256) {
  assert.ok(
    typeof serialized === "string" && Buffer.byteLength(serialized) <= 256000,
    "cache_bound",
  );
  const result = JSON.parse(serialized),
    call = result.call;
  assert.equal(result.status, "observed");
  assert.equal(result.integrationAllowed, false);
  assert.ok(call && call.reason === null && call.processSignal === null, "worker_failure");
  const raw = JSON.parse(call.stdout);
  const checked = decodeEmbeddingPair(
    {
      stdout: call.stdout,
      stderr: call.stderr,
      raw,
      exitCode: call.exitCode,
      failed: false,
      signal: null,
      errorCode: null,
      wallMs: call.wallMs,
    },
    {
      id: imageSha256,
      expectedCenter18: raw.views?.[0]?.scores,
      expectedFit18: raw.views?.[1]?.scores,
    },
    {
      expectedBinarySha256: LOCAL_EMBEDDING_PINS.binarySha256,
      attempt: { imageSha256, binarySha256: LOCAL_EMBEDDING_PINS.binarySha256 },
    },
  );
  assert.ok(checked.valid && checked.operationalSuccess, "invalid_cached_pair");
  assert.deepEqual(result.observation, raw, "raw_observation_drift");
  assert.deepEqual(result.receipt.vector, checked.views[0].embedding);
  assert.equal(result.receipt.imageSha256, imageSha256);
  assert.equal(result.receipt.vectorSha256, sha(JSON.stringify(checked.views[0].embedding)));
  for (const [key, value] of Object.entries(LOCAL_EMBEDDING_IDENTITY))
    assert.equal(result.receipt[key], value);
  return {
    center: checked.views[0].embedding,
    fit: checked.views[1].embedding,
    counters: checked.counters,
  };
}
function sourcePins(root) {
  const result = {};
  function visit(relative) {
    const file = path.join(root, relative),
      info = fs.lstatSync(file);
    assert.ok(!info.isSymbolicLink());
    if (info.isDirectory())
      for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
    else if (/\.(ts|mjs|swift|json)$/u.test(file)) {
      assert.ok(Object.keys(result).length < 256);
      result[relative] = sha(readBounded(file, 2_000_000));
    }
  }
  for (const dir of ["shared/domain/src", "scripts/qa/reference-image", "scripts/qa/local-vision"])
    visit(dir);
  for (const file of [
    "pnpm-lock.yaml",
    "package.json",
    "docs/final/OFF_CACHED_V2_PROTOCOL.md",
    "scripts/__tests__/off-cached-v2.test.mjs",
  ])
    result[file] = sha(readBounded(path.join(root, file), 2_000_000));
  return result;
}
function cachedInputs(root) {
  const pins = {
    [`${parent}freeze/lock.json`]: priorLockSha,
    [`${parent}result/summary.json`]: priorResultSha,
  };
  const bytesFor = (file) => readBounded(checkedWorkFile(file, root), 2_000_000);
  for (const [file, hash] of Object.entries(pins)) assert.equal(sha(bytesFor(file)), hash);
  const lock = JSON.parse(bytesFor(`${parent}freeze/lock.json`)),
    base = JSON.parse(bytesFor(`${parent}result/summary.json`));
  assert.equal(base.lockSha256, priorLockSha);
  assert.equal(base.failure, null);
  assert.equal(base.newWork.observedProcesses, 20);
  assert.equal(base.integrationAllowed, false);
  // New public exports legitimately changed since v1. Authenticate historical
  // bytes from the exact committed snapshot, not a whitespace-normalized file.
  const archived = {};
  for (const [file, hash] of Object.entries(lock.sources)) {
    assert.ok(/^[a-zA-Z0-9_./-]+$/u.test(file) && !file.split("/").includes(".."));
    const current = readBounded(path.join(root, file), 2_000_000);
    if (sha(current) !== hash) {
      const historical = execFileSync("/usr/bin/git", ["show", `${priorCommit}:${file}`], {
        cwd: root,
        maxBuffer: 2_000_000,
        env: { PATH: "/usr/bin:/bin" },
      });
      assert.equal(sha(historical), hash, "historical_source_drift");
      archived[file] = hash;
    }
  }
  for (const [file, hash] of Object.entries(lock.inputFiles)) {
    assert.equal(sha(bytesFor(file)), hash);
    pins[file] = hash;
  }
  const pairs = new Map();
  for (const row of lock.images.filter((r) => r.process)) {
    const file = `${parent}result/${row.blindId}-encoding.json`,
      bytes = bytesFor(file);
    pins[file] = sha(bytes);
    const attemptFile = `${parent}result/${row.blindId}-attempt.json`,
      attemptBytes = bytesFor(attemptFile),
      attempt = JSON.parse(attemptBytes);
    assert.equal(attempt.imageSha256, row.imageSha256);
    assert.equal(attempt.lockSha256, priorLockSha);
    pins[attemptFile] = sha(attemptBytes);
    pairs.set(row.blindId, readCachedPair(bytes.toString("utf8"), row.imageSha256));
  }
  assert.equal(pairs.size, 20);
  assert.equal(base.rows.length, 21);
  return { base, lock, pins, pairs, archived };
}
const lane = (value) =>
  value.status === "candidate"
    ? { status: "candidate", productId: value.productId }
    : value.status === "ambiguous"
      ? { status: "ambiguous", productIds: value.productIds }
      : { status: value.status === "unknown" ? "unknown" : "unavailable" };
export async function freezeCachedV2(outputArgument, root = project) {
  assert.ok(!fs.existsSync(path.join(root, ledger)), "cached_v2_already_attempted");
  const output = checkedOutput(outputArgument, root),
    input = cachedInputs(root),
    sources = sourcePins(root);
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
  const engine = path.relative(root, path.join(output, "engine/reference-vision.mjs")),
    engineSha256 = sha(readBounded(path.join(root, engine), 4_000_000));
  assert.deepEqual(sourcePins(root), sources);
  assert.deepEqual(cachedInputs(root).pins, input.pins);
  const saved = writeJsonExclusive(
    path.join(output, "lock.json"),
    {
      schemaVersion: "off-cached-v2-lock",
      policy: OFF_CACHED_V2_POLICY,
      sources,
      inputPins: input.pins,
      archivedPriorSources: input.archived,
      priorCommit,
      engine,
      engineSha256,
      node: process.version,
      platform: process.platform,
      newModelCallsBeforeFreeze: 0,
    },
    root,
  );
  return { lock: path.relative(root, saved.path), sha256: saved.sha256 };
}
export async function runCachedV2(lockArgument, lockSha256, outputArgument, root = project) {
  assert.match(lockSha256, /^[a-f0-9]{64}$/u);
  const bytes = readBounded(checkedWorkFile(lockArgument, root), 2_000_000);
  assert.equal(sha(bytes), lockSha256);
  const lock = JSON.parse(bytes),
    output = checkedOutput(outputArgument, root);
  assert.equal(lock.schemaVersion, "off-cached-v2-lock");
  assert.deepEqual(lock.policy, OFF_CACHED_V2_POLICY);
  assert.equal(lock.node, process.version);
  assert.equal(lock.platform, process.platform);
  assert.equal(lock.priorCommit, priorCommit);
  const check = () => {
    assert.deepEqual(sourcePins(root), lock.sources);
    const input = cachedInputs(root);
    assert.deepEqual(input.pins, lock.inputPins);
    assert.deepEqual(input.archived, lock.archivedPriorSources);
    assert.equal(
      sha(readBounded(checkedWorkFile(lock.engine, root), 4_000_000)),
      lock.engineSha256,
    );
    return input;
  };
  const input = check(),
    api = await import(pathToFileURL(path.join(root, lock.engine)).href);
  const gallery = input.lock.images.filter((r) => r.role === "gallery_self"),
    enrolled = [...new Set(gallery.map((r) => r.productId))];
  const catalogueSha256 = sha(
    JSON.stringify(
      gallery.map((r) => ({
        referenceId: r.blindId,
        productId: r.productId,
        imageSha256: r.imageSha256,
      })),
    ),
  );
  assert.equal(catalogueSha256, input.base.catalogueSha256);
  const identity = (view) => ({
    ...LOCAL_EMBEDDING_IDENTITY,
    preprocessingSha256:
      view === "center"
        ? LOCAL_EMBEDDING_IDENTITY.preprocessingSha256
        : sha(
            "aspect-fit-256-srgb-gray127-v1|l2-double-reduction-order-v1|final_emb_1|Float32|1,512",
          ),
    catalogueSha256,
  });
  const indexes = {};
  for (const view of ["center", "fit"]) {
    indexes[view] = api.createReferenceEmbeddingIndex(
      JSON.stringify({
        ...identity(view),
        minimumCosine: 0.9,
        minimumMargin: 0.08,
        references: gallery.map((r) => ({
          referenceId: r.blindId,
          productId: r.productId,
          imageSha256: r.imageSha256,
          vector: input.pairs.get(r.blindId)[view],
        })),
      }),
    );
    assert.equal(indexes[view].status, "ready");
  }
  writeJsonExclusive(
    path.join(root, ledger),
    { lockSha256, output: path.relative(root, output), newModelCalls: 0 },
    root,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  const observations = [];
  for (const row of input.base.rows.filter((r) => r.role === "cross_upload")) {
    const source = input.lock.images.find((r) => r.blindId === row.blindId),
      pair = input.pairs.get(row.blindId),
      views = {};
    for (const view of ["center", "fit"]) {
      const embedding = indexes[view].compare(
        JSON.stringify({ ...identity(view), imageSha256: source.imageSha256, vector: pair[view] }),
      );
      if (view === "center") assert.deepEqual(embedding, row.embedding, "original_center_parity");
      const hybrid = api.fuseMonotoneReferenceIdentityEvidence(
        JSON.stringify({
          pixelImageSha256: source.imageSha256,
          embeddingImageSha256: source.imageSha256,
          pixel: lane(row.pixel),
          embedding: lane(embedding),
          enrolledProductIds: enrolled,
          quarantineGroups: input.base.guard.groups.map((g) => g.productIds),
        }),
      );
      views[view] = { embedding, hybrid };
    }
    observations.push({ blindId: row.blindId, productId: row.productId, views });
  }
  const metrics = {};
  for (const view of ["center", "fit"]) {
    const rows = input.base.rows.map((row) => {
      const own = observations.find((r) => r.blindId === row.blindId);
      return {
        ...row,
        ...(own ? { embedding: own.views[view].embedding, hybrid: own.views[view].hybrid } : {}),
      };
    });
    metrics[view] = summarizeHybridRows(rows);
  }
  check();
  const result = {
    schemaVersion: "off-cached-v2-result",
    lockSha256,
    priorResultSha,
    metrics,
    observations,
    originalV1: input.base.arms,
    work: {
      newImageCalls: 0,
      newModelCalls: 0,
      newPixelMatches: 0,
      newTrainingCalls: 0,
      paidCalls: 0,
      retrievals: 24,
      v2Fusions: 24,
      replayedOriginalCenterDecisions: 12,
    },
    scope: "seen_cached_development_not_heldout",
    winnerSelected: false,
    independentAccuracyEstablished: false,
    integrationAllowed: false,
  };
  const saved = writeJsonExclusive(path.join(output, "summary.json"), result, root);
  return {
    summary: path.relative(root, saved.path),
    sha256: saved.sha256,
    metrics,
    work: result.work,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let result;
  if (args.length === 2 && args[0] === "--freeze") result = await freezeCachedV2(args[1]);
  else if (args.length === 4 && args[0] === "--run")
    result = await runCachedV2(args[1], args[2], args[3]);
  else throw Error("Use --freeze work/new-freeze OR --run lock.json sha work/new-result");
  console.log(JSON.stringify(result));
}
