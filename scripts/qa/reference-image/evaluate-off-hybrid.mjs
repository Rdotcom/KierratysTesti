// Explicit offline DEVELOPMENT comparison; existing OFF identities are unreviewed.
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
import { summarizeDevelopment } from "./evaluate-off-development.mjs";
import {
  createPinnedLocalEmbeddingAdapter,
  LOCAL_EMBEDDING_IDENTITY,
  LOCAL_EMBEDDING_PINS,
  verifyLocalEmbeddingAssets,
} from "./local-embedding-adapter.mjs";
import { selfEvidenceEnvelope } from "./replay-identity-guard.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const prior = "work/off-release-2026-11-13.MnzfCI/";
const baselinePins = Object.freeze({
  [`${prior}development-result/summary.json`]:
    "8f66d78f5050f77c2a411f78c6c8cb9b9e235564f68ad5459beb3ad8f359cfd8",
  [`${prior}development-freeze/lock.json`]:
    "9e2bfd32e548e99b01c1e9dcafe922b50a111ab5773c6e0f1039f0c64c0187ee",
});
const ledger = "work/off-hybrid-development-v1-attempt.json";
export const OFF_HYBRID_POLICY = Object.freeze({
  id: "off-hybrid-development-v1",
  minimumCosine: 0.9,
  minimumMargin: 0.08,
  maximumProcesses: 20,
  maximumImageDecodes: 20,
  maximumImagePredictions: 40,
  maximumTextPredictions: 0,
  maximumRetrievals: 12,
  maximumFusions: 12,
  pixelBaseline: "reuse_exact_prior_receipts_no_reprocessing",
  selectedView: "center",
  fusion: "reference-embedding-pixel-veto-v1",
  quarantine: "prior_gallery_self_only_no_query_labels",
  gallerySelection: "unchanged_prior_first_two_numeric_uploads",
  stopOnRequiredFailure: true,
  developmentGate: {
    minimumSourceAgreements: 3,
    maximumSourceDisagreements: 0,
    maximumGuardedPixelAgreementLosses: 0,
  },
  humanAccepted: false,
  independentAccuracyEstablished: false,
  integrationAllowed: false,
});
const json = (file, max = 2_000_000) => JSON.parse(readBounded(file, max));
function sources(root) {
  const result = {};
  function visit(relative) {
    const file = path.join(root, relative),
      info = fs.lstatSync(file);
    assert.ok(!info.isSymbolicLink(), "linked_source");
    if (info.isDirectory())
      for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
    else if (/\.(?:ts|mjs|swift|json)$/u.test(file)) {
      assert.ok(Object.keys(result).length < 256, "source_limit");
      result[relative] = sha(readBounded(file, 2_000_000));
    }
  }
  for (const dir of ["shared/domain/src", "scripts/qa/reference-image", "scripts/qa/local-vision"])
    visit(dir);
  for (const file of [
    "pnpm-lock.yaml",
    "package.json",
    "scripts/qa/protocols/off-hybrid-development-protocol.md",
    "scripts/__tests__/off-hybrid-development.test.mjs",
  ])
    result[file] = sha(readBounded(path.join(root, file), 2_000_000));
  return result;
}
function inputs(root) {
  for (const [file, hash] of Object.entries(baselinePins))
    assert.equal(sha(readBounded(path.join(root, file), 2_000_000)), hash, "baseline_drift");
  const base = json(path.join(root, prior, "development-result/summary.json"));
  const lock = json(path.join(root, prior, "development-freeze/lock.json"));
  assert.equal(base.lockSha256, baselinePins[`${prior}development-freeze/lock.json`]);
  assert.deepEqual(summarizeDevelopment(base.rows, lock.plan).crossUpload, base.crossUpload);
  assert.ok(
    base.diagnosticComplete && base.humanAccepted === false && base.integrationAllowed === false,
  );
  const files = {
    ...baselinePins,
    ...lock.binding.files,
    [lock.binding.acquisition]: lock.binding.acquisitionSha256,
    [lock.binding.privacy]: lock.binding.privacySha256,
    [lock.engine]: lock.engineSha256,
  };
  for (const [file, hash] of Object.entries(files)) {
    assert.equal(sha(readBounded(checkedWorkFile(file, root), 4_000_000)), hash, "old_input_drift");
  }
  assert.equal(base.rows.filter((row) => row.process).length, 20);
  assert.equal(base.rows.filter((row) => row.role === "gallery_self").length, 8);
  assert.equal(base.rows.filter((row) => row.role === "cross_upload").length, 12);
  assert.ok(
    base.rows
      .filter((row) => row.process)
      .every((row) => ["candidate", "ambiguous", "unknown"].includes(row.result.status)),
  );
  const acquisition = json(path.join(root, lock.binding.acquisition));
  const images = base.rows.map((row) => {
    const record = acquisition.observations.find((item) => item.blindId === row.blindId);
    assert.equal(record.originalSha256, row.originalSha256, "original_join");
    const file = path.join(path.dirname(lock.binding.acquisition), record.originalFile);
    assert.equal(files[file], row.originalSha256, "original_pin");
    return {
      blindId: row.blindId,
      productId: row.productId,
      role: row.role,
      process: row.process,
      file,
      imageSha256: row.originalSha256,
    };
  });
  assert.equal(
    new Set(images.filter((row) => row.process).map((row) => row.imageSha256)).size,
    20,
    "duplicate_original",
  );
  return { base, lock, files, images };
}
function lane(result) {
  if (result.status === "candidate") return { status: "candidate", productId: result.productId };
  if (result.status === "ambiguous") return { status: "ambiguous", productIds: result.productIds };
  return { status: result.status === "unknown" ? "unknown" : "unavailable" };
}
export function summarizeHybridRows(rows) {
  assert.ok(
    Array.isArray(rows) && rows.length === 21 && new Set(rows.map((r) => r.blindId)).size === 21,
    "all_planned_rows_required",
  );
  const queries = rows.filter((row) => row.role === "cross_upload");
  assert.equal(queries.length, 12, "all_query_denominators_required");
  const stats = {};
  for (const arm of ["pixel", "embedding", "hybrid"]) {
    const count = {
      planned: 12,
      sourceAgreements: 0,
      sourceDisagreements: 0,
      ambiguous: 0,
      unknown: 0,
      failed: 0,
      notAttempted: 0,
    };
    for (const row of queries) {
      const r = row[arm];
      if (!r) count.notAttempted++;
      else if (r.status === "candidate")
        count[r.productId === row.productId ? "sourceAgreements" : "sourceDisagreements"]++;
      else if (r.status === "ambiguous") count.ambiguous++;
      else if (r.status === "unknown") count.unknown++;
      else count.failed++;
    }
    stats[arm] = count;
  }
  const losses = queries
    .filter(
      (row) =>
        row.pixel?.status === "candidate" &&
        row.pixel.productId === row.productId &&
        !(row.hybrid?.status === "candidate" && row.hybrid.productId === row.productId),
    )
    .map((row) => row.blindId);
  const complete =
    stats.embedding.failed === 0 &&
    stats.embedding.notAttempted === 0 &&
    stats.hybrid.failed === 0 &&
    stats.hybrid.notAttempted === 0;
  return {
    arms: stats,
    guardedPixelAgreementLosses: losses,
    developmentGatePassed:
      complete &&
      stats.hybrid.sourceAgreements >= 3 &&
      stats.hybrid.sourceDisagreements === 0 &&
      losses.length === 0,
    plannedUploads: 21,
    gallerySelf: 8,
    crossUpload: 12,
    insufficientGallery: 1,
    independentAccuracyEstablished: false,
    integrationAllowed: false,
  };
}
export async function freezeHybrid(outputArgument, root = project) {
  assert.ok(!fs.existsSync(path.join(root, ledger)), "hybrid_already_attempted");
  const output = checkedOutput(outputArgument, root),
    input = inputs(root),
    snapshot = sources(root);
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
  const engine = path.relative(root, path.join(output, "engine/reference-vision.mjs"));
  const engineSha256 = sha(readBounded(path.join(root, engine), 4_000_000));
  assert.deepEqual(sources(root), snapshot);
  const saved = writeJsonExclusive(
    path.join(output, "lock.json"),
    {
      schemaVersion: "off-hybrid-lock-v1",
      policy: OFF_HYBRID_POLICY,
      sources: snapshot,
      baselinePins,
      inputFiles: input.files,
      images: input.images,
      engine,
      engineSha256,
      encoderPins: LOCAL_EMBEDDING_PINS,
      encoderIdentity: LOCAL_EMBEDDING_IDENTITY,
      node: process.version,
      platform: process.platform,
      imageCallsBeforeLock: 0,
    },
    root,
  );
  return { lock: path.relative(root, saved.path), sha256: saved.sha256 };
}
export async function runHybrid(lockArgument, lockSha256, outputArgument, root = project) {
  assert.match(lockSha256, /^[a-f0-9]{64}$/u);
  const lockFile = checkedWorkFile(lockArgument, root),
    lockBytes = readBounded(lockFile, 2_000_000);
  assert.equal(sha(lockBytes), lockSha256, "lock_hash");
  const lock = JSON.parse(lockBytes),
    output = checkedOutput(outputArgument, root);
  assert.equal(lock.schemaVersion, "off-hybrid-lock-v1");
  assert.deepEqual(lock.policy, OFF_HYBRID_POLICY);
  assert.deepEqual(lock.baselinePins, baselinePins);
  assert.equal(lock.node, process.version);
  assert.equal(lock.platform, process.platform);
  const check = () => {
    assert.deepEqual(sources(root), lock.sources, "source_drift");
    const bound = inputs(root);
    assert.deepEqual(bound.files, lock.inputFiles);
    assert.deepEqual(bound.images, lock.images);
    assert.equal(
      sha(readBounded(checkedWorkFile(lock.engine, root), 4_000_000)),
      lock.engineSha256,
    );
    assert.deepEqual(lock.encoderPins, LOCAL_EMBEDDING_PINS);
    assert.deepEqual(lock.encoderIdentity, verifyLocalEmbeddingAssets(root));
    return bound;
  };
  const input = check(),
    api = await import(pathToFileURL(path.join(root, lock.engine)).href);
  const derived = api.deriveReferenceIdentityGuard(
    JSON.stringify(selfEvidenceEnvelope(input.base.rows)),
  );
  assert.equal(derived.status, "ready");
  const guard = derived.guard,
    enrolled = [
      ...new Set(input.images.filter((r) => r.role === "gallery_self").map((r) => r.productId)),
    ];
  const rows = input.base.rows.map((row) => ({
    blindId: row.blindId,
    productId: row.productId,
    role: row.role,
    pixel: api.guardReferenceIdentity(row.result, guard),
    embedding: null,
    hybrid: null,
  }));
  const order = [
    ...input.images.filter((r) => r.role === "gallery_self"),
    ...input.images.filter((r) => r.role === "cross_upload"),
  ];
  const catalogueSha256 = sha(
    JSON.stringify(
      order
        .filter((r) => r.role === "gallery_self")
        .map((r) => ({
          referenceId: r.blindId,
          productId: r.productId,
          imageSha256: r.imageSha256,
        })),
    ),
  );
  const adapter = createPinnedLocalEmbeddingAdapter(root),
    receipts = new Map();
  writeJsonExclusive(
    path.join(root, ledger),
    { lockSha256, output: path.relative(root, output), processBudget: 20, predictionBudget: 40 },
    root,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  let failure = null,
    attempted = 0,
    observed = 0,
    completedPredictionsLowerBound = 0;
  for (const source of order) {
    check();
    const bytes = readBounded(checkedWorkFile(source.file, root), 1500000);
    assert.equal(sha(bytes), source.imageSha256);
    writeJsonExclusive(
      path.join(output, `${source.blindId}-attempt.json`),
      { lockSha256, imageSha256: source.imageSha256, ordinal: attempted },
      root,
    );
    attempted++;
    const result = await adapter.encode(new Uint8Array(bytes));
    writeJsonExclusive(path.join(output, `${source.blindId}-encoding.json`), result, root);
    if (result.status !== "observed") {
      failure = { blindId: source.blindId, reason: result.reason };
      const row = rows.find((row) => row.blindId === source.blindId);
      row.embedding = { status: "unavailable", reason: result.reason };
      if (result.call) {
        const progress = await import("../local-vision/embedding-data.mjs");
        const p = progress.validateEmbeddingProgress(result.call.stderr);
        if (p.valid)
          completedPredictionsLowerBound += p.lastCounters?.imagePredictionsCompleted ?? 0;
      }
      break;
    }
    observed++;
    completedPredictionsLowerBound += result.observation.counters.imagePredictionsCompleted;
    assert.equal(result.receipt.imageSha256, source.imageSha256);
    receipts.set(source.blindId, result.receipt);
  }
  if (!failure) {
    const references = order
      .filter((r) => r.role === "gallery_self")
      .map((r) => ({
        referenceId: r.blindId,
        productId: r.productId,
        imageSha256: r.imageSha256,
        vector: receipts.get(r.blindId).vector,
      }));
    const index = api.createReferenceEmbeddingIndex(
      JSON.stringify({
        ...LOCAL_EMBEDDING_IDENTITY,
        catalogueSha256,
        minimumCosine: 0.9,
        minimumMargin: 0.08,
        references,
      }),
    );
    assert.equal(index.status, "ready");
    for (const row of rows.filter((r) => r.role === "cross_upload")) {
      const receipt = receipts.get(row.blindId);
      row.embedding = index.compare(
        JSON.stringify({
          ...LOCAL_EMBEDDING_IDENTITY,
          catalogueSha256,
          imageSha256: receipt.imageSha256,
          vector: receipt.vector,
        }),
      );
      row.hybrid = api.fuseReferenceIdentityEvidence(
        JSON.stringify({
          pixelImageSha256: receipt.imageSha256,
          embeddingImageSha256: receipt.imageSha256,
          pixel: lane(row.pixel),
          embedding: lane(row.embedding),
          enrolledProductIds: enrolled,
          quarantineGroups: guard.groups.map((g) => g.productIds),
        }),
      );
    }
  }
  check();
  const metrics = summarizeHybridRows(rows);
  const result = {
    schemaVersion: "off-hybrid-result-v1",
    lockSha256,
    scope: "seen_community_labelled_development_not_independent_accuracy",
    failure,
    ...metrics,
    rows,
    guard,
    catalogueSha256,
    priorRawPixel: input.base.crossUpload,
    newWork: {
      attemptedProcesses: attempted,
      observedProcesses: observed,
      notAttemptedProcesses: 20 - attempted,
      imagePredictionsCompletedLowerBound: completedPredictionsLowerBound,
      counterEvidence: failure
        ? "inspect_worker_footer_and_progress_lower_bounds"
        : "exact_complete_worker_footers",
      newPixelDecodes: 0,
      newPixelExtractions: 0,
      newPixelMatches: 0,
      retrievals: failure ? 0 : 12,
      fusions: failure ? 0 : 12,
      textPredictions: 0,
      training: 0,
      paidRequests: 0,
    },
    limitations: [
      "Community labels unreviewed; not identity truth",
      "Uploads not proven independent captures",
      "No outside/mixed/hazard controls",
      "Prince has no cross query; Coca-Cola insufficient gallery",
      "Pixel uses prior review derivatives; embeddings use original JPEGs; not isolated algorithm ablation",
    ],
    humanAccepted: false,
    releaseAccepted: false,
  };
  const saved = writeJsonExclusive(path.join(output, "summary.json"), result, root);
  return {
    summary: path.relative(root, saved.path),
    sha256: saved.sha256,
    metrics,
    newWork: result.newWork,
    failure,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let result;
  if (args.length === 2 && args[0] === "--freeze") result = await freezeHybrid(args[1]);
  else if (args.length === 4 && args[0] === "--run")
    result = await runHybrid(args[1], args[2], args[3]);
  else throw Error("Use --freeze work/new-freeze OR --run work/lock.json lock-sha work/new-result");
  console.log(JSON.stringify(result));
}
