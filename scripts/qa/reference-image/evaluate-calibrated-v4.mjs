// Frozen engineering calibration. No new encoder/image/network work.
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
import { decodeEmbeddingPair } from "../local-vision/embedding-data.mjs";
import { readCachedPair } from "./evaluate-off-cached-v2.mjs";
import { LOCAL_EMBEDDING_IDENTITY, LOCAL_EMBEDDING_PINS } from "./local-embedding-adapter.mjs";

const rootDefault = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const v2 = "work/off-cached-v2-2026-11-13.Nm7iXg/",
  off = "work/off-hybrid-2026-11-13.AL8bSt/",
  old = "work/two-view-learning-2026-11-09.d0J4kb/";
const pins = Object.freeze({
  "work/calibrated-v3-2026-11-13.PpATi3/freeze-final/lock.json":
    "0e25cbbd457df97e2aae099c08f30eb29e4a961ddfe121363d6101cd80b2d3bf",
  "work/calibrated-v3-2026-11-13.PpATi3/result/summary.json":
    "03e25ef8851eb5c34d3cd905838f5bf30dce4e072322b6db0f330a43b5614c18",
  [`${v2}freeze/lock.json`]: "90fa33e092a4623cfe54a37f2883b7731ab77218b0b735e3d8be9a1c0c9e8457",
  [`${v2}result/summary.json`]: "8e30dee8ff594a5277cf3fed475eb1532e39cab409673a5508731218a9c73557",
  [`${old}freeze/lock.json`]: "6718e2f951c823f194ffde1715726d61cf5a780beabdc45c8469b3239378bd4d",
  [`${old}acquisition/summary.json`]:
    "dc42e458fb366b6cef48faa93d963bf147b59cb253d04f6a7e49879e77abfd1c",
});
const ledger = "work/calibrated-reference-v4-attempt.json";
export const CALIBRATED_V4_POLICY = Object.freeze({
  id: "calibrated-reference-v3",
  view: "fit",
  calibration: "gallery-negative-midpoint-support-v1",
  calibrationOnly: 40,
  evaluationNegatives: 24,
  unresolvedJars: 8,
  productQueries: 12,
  maximumQueriesPerArm: 44,
  significanceMinimumAgreements: 4,
  maximumDisagreements: 0,
  maximumControlCandidates: 0,
  maximumPixelAgreementLosses: 0,
  newModelCalls: 0,
  integrationAllowed: false,
  independentAccuracyEstablished: false,
});
export function planControl(fixture, split) {
  assert.ok(["train", "validation"].includes(split));
  assert.ok(
    fixture &&
      typeof fixture.id === "string" &&
      typeof fixture.title === "string" &&
      typeof fixture.sha256 === "string",
  );
  assert.ok(
    !/nutella|barilla|\bprince\b|coca.cola/iu.test(
      `${fixture.title} ${fixture.sourceDescription ?? ""}`,
    ),
    "identity_overlap_requires_review",
  );
  // Coarse jar labels cannot establish a different exact packaged product.
  const role =
    fixture.expectedKind === "jar"
      ? "unresolved_identity"
      : split === "train"
        ? "calibration_only"
        : "evaluation_negative";
  return {
    id: fixture.sha256,
    sourceId: fixture.id,
    title: fixture.title,
    sourceFamily: fixture.sourceFamily ?? fixture.group,
    split,
    role,
    reviewStatus: "source_ai_only_human_review_required",
    controlKind: fixture.id.includes("mixed")
      ? "mixed_scene"
      : /battery|batteries|aerosol|spray|sealer/iu.test(fixture.id)
        ? "hazard_form_not_verified_hazard"
        : "other_source_asserted",
  };
}
function currentSources(root) {
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
    "scripts/qa/protocols/calibrated-v4-protocol.md",
    "scripts/__tests__/calibrated-v4.test.mjs",
  ])
    out[file] = sha(readBounded(path.join(root, file), 2_000_000));
  return out;
}
function boundData(root) {
  const files = { ...pins },
    read = (file) => readBounded(checkedWorkFile(file, root), 4_000_000),
    json = (file) => JSON.parse(read(file));
  for (const [file, hash] of Object.entries(pins)) assert.equal(sha(read(file)), hash, "prior_pin");
  const v2Lock = json(`${v2}freeze/lock.json`),
    v2Result = json(`${v2}result/summary.json`);
  assert.equal(v2Result.lockSha256, pins[`${v2}freeze/lock.json`]);
  for (const [file, hash] of Object.entries(v2Lock.inputPins)) {
    assert.equal(sha(read(file)), hash, "prior_data_drift");
    files[file] = hash;
  }
  const offLock = json(`${off}freeze/lock.json`),
    offResult = json(`${off}result/summary.json`),
    pairs = new Map();
  for (const row of offLock.images.filter((r) => r.process)) {
    const file = `${off}result/${row.blindId}-encoding.json`;
    pairs.set(row.blindId, readCachedPair(read(file).toString("utf8"), row.imageSha256));
  }
  const oldLock = json(`${old}freeze/lock.json`),
    acquisition = json(`${old}acquisition/summary.json`);
  assert.equal(acquisition.lockSha256, pins[`${old}freeze/lock.json`]);
  assert.equal(acquisition.status, "complete");
  assert.equal(acquisition.cases.length, 72);
  const train = new Set(oldLock.allocation.train),
    evaluation = new Set(oldLock.allocation.validation);
  assert.equal(train.size, 45);
  assert.equal(evaluation.size, 27);
  const fixtures = [];
  for (const manifest of oldLock.basisProof.linearProof.manifests) {
    const bytes = read(manifest.path);
    assert.equal(sha(bytes), manifest.sha256);
    files[manifest.path] = manifest.sha256;
    fixtures.push(...JSON.parse(bytes).fixtures);
  }
  assert.equal(fixtures.length, 72);
  assert.equal(new Set(fixtures.map((f) => f.sha256)).size, 72);
  const controls = [];
  for (const fixture of fixtures) {
    const id = fixture.sha256;
    assert.ok(train.has(id) !== evaluation.has(id));
    assert.ok(!offLock.images.some((row) => row.imageSha256 === id), "gallery_query_overlap");
    const plan = planControl(fixture, train.has(id) ? "train" : "validation"),
      saved = acquisition.cases.find((r) => r.id === id);
    assert.ok(saved && saved.status === "observed");
    const rawFile = `${old}acquisition/raw/${id}.json`,
      attemptFile = `${old}acquisition/attempts/${id}.json`,
      bytes = read(rawFile),
      attemptBytes = read(attemptFile);
    assert.equal(sha(bytes), saved.rawSha256);
    assert.equal(sha(attemptBytes), saved.attemptSha256);
    files[rawFile] = saved.rawSha256;
    files[attemptFile] = saved.attemptSha256;
    const call = JSON.parse(bytes),
      attempt = JSON.parse(attemptBytes),
      raw = call.raw;
    assert.equal(attempt.imageSha256, id);
    assert.equal(attempt.lockSha256, acquisition.lockSha256);
    const pair = decodeEmbeddingPair(
      call,
      { id, expectedCenter18: raw.views?.[0]?.scores, expectedFit18: raw.views?.[1]?.scores },
      {
        expectedBinarySha256: LOCAL_EMBEDDING_PINS.binarySha256,
        attempt: { imageSha256: id, binarySha256: attempt.binarySha256 },
      },
    );
    assert.ok(pair.valid && pair.operationalSuccess, "cached_control_invalid");
    controls.push({ ...plan, vector: pair.views[1].embedding });
  }
  const counts = Object.fromEntries(
    ["calibration_only", "evaluation_negative", "unresolved_identity"].map((role) => [
      role,
      controls.filter((r) => r.role === role).length,
    ]),
  );
  assert.deepEqual(counts, {
    calibration_only: 40,
    evaluation_negative: 24,
    unresolved_identity: 8,
  });
  for (const component of oldLock.allocationEvidence.components) {
    assert.ok(
      component.ids.every((id) => train.has(id) === (component.split === "train")),
      "family_split_drift",
    );
  }
  const trainFamilies = new Set(
    controls.filter((r) => r.split === "train").map((r) => r.sourceFamily),
  );
  assert.ok(
    controls
      .filter((r) => r.split === "validation")
      .every((r) => !trainFamilies.has(r.sourceFamily)),
    "family_leakage",
  );
  return { files, pairs, offLock, offResult, v2Result, controls };
}
const lane = (result) =>
  result.status === "candidate"
    ? { status: "candidate", productId: result.productId }
    : result.status === "ambiguous"
      ? { status: "ambiguous", productIds: result.productIds }
      : { status: result.status === "unknown" ? "unknown" : "unavailable" };
export function summarizeCalibrated(rows) {
  assert.equal(rows.length, 44);
  assert.equal(new Set(rows.map((r) => r.id)).size, 44);
  const product = rows.filter((r) => r.role === "product"),
    controls = rows.filter((r) => r.role === "evaluation_negative"),
    unresolved = rows.filter((r) => r.role === "unresolved_identity");
  assert.equal(product.length, 12);
  assert.equal(controls.length, 24);
  assert.equal(unresolved.length, 8);
  const summary = {};
  for (const arm of ["baseline", "calibrated"]) {
    const sourceAgreements = product.filter(
      (r) => r[arm]?.status === "candidate" && r[arm].productId === r.productId,
    ).length;
    const sourceDisagreements = product.filter(
      (r) => r[arm]?.status === "candidate" && r[arm].productId !== r.productId,
    ).length;
    const controlCandidates = controls
        .filter((r) => r[arm]?.status === "candidate")
        .map((r) => r.id),
      unresolvedCandidates = unresolved
        .filter((r) => r[arm]?.status === "candidate")
        .map((r) => r.id);
    const losses = product
      .filter(
        (r) =>
          r.pixel?.status === "candidate" &&
          r.pixel.productId === r.productId &&
          !(r[arm]?.status === "candidate" && r[arm].productId === r.productId),
      )
      .map((r) => r.id);
    const failures = rows
      .filter((r) => !r[arm] || !["candidate", "unknown", "ambiguous"].includes(r[arm].status))
      .map((r) => r.id);
    summary[arm] = {
      sourceAgreements,
      sourceDisagreements,
      ambiguous: product.filter((r) => r[arm]?.status === "ambiguous").length,
      unknown: product.filter((r) => r[arm]?.status === "unknown").length,
      controlCandidates,
      unresolvedCandidates,
      guardedPixelLosses: losses,
      failures,
      significantDevelopmentChange:
        sourceAgreements >= 4 &&
        sourceDisagreements === 0 &&
        controlCandidates.length === 0 &&
        unresolvedCandidates.length === 0 &&
        losses.length === 0 &&
        failures.length === 0,
    };
  }
  return summary;
}
export async function freezeMaxMargin(outputArgument, root = rootDefault) {
  assert.ok(!fs.existsSync(path.join(root, ledger)), "calibration_v3_already_attempted");
  const output = checkedOutput(outputArgument, root),
    data = boundData(root),
    sources = currentSources(root);
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
  assert.deepEqual(currentSources(root), sources);
  assert.deepEqual(boundData(root).files, data.files);
  const saved = writeJsonExclusive(
    path.join(output, "lock.json"),
    {
      schemaVersion: "calibrated-v4-lock",
      policy: CALIBRATED_V4_POLICY,
      sources,
      inputPins: data.files,
      controlPlan: data.controls.map(({ vector: _, ...row }) => row),
      engine,
      engineSha256,
      node: process.version,
      platform: process.platform,
    },
    root,
  );
  return { lock: path.relative(root, saved.path), sha256: saved.sha256 };
}
export async function runMaxMargin(lockArgument, lockSha256, outputArgument, root = rootDefault) {
  assert.match(lockSha256, /^[a-f0-9]{64}$/u);
  const bytes = readBounded(checkedWorkFile(lockArgument, root), 2_000_000);
  assert.equal(sha(bytes), lockSha256);
  const lock = JSON.parse(bytes),
    output = checkedOutput(outputArgument, root);
  assert.equal(lock.schemaVersion, "calibrated-v4-lock");
  assert.deepEqual(lock.policy, CALIBRATED_V4_POLICY);
  assert.equal(lock.node, process.version);
  assert.equal(lock.platform, process.platform);
  const check = () => {
    assert.deepEqual(currentSources(root), lock.sources);
    const data = boundData(root);
    assert.deepEqual(data.files, lock.inputPins);
    assert.deepEqual(
      data.controls.map(({ vector: _, ...row }) => row),
      lock.controlPlan,
    );
    assert.equal(
      sha(readBounded(checkedWorkFile(lock.engine, root), 4_000_000)),
      lock.engineSha256,
    );
    return data;
  };
  const data = check(),
    api = await import(pathToFileURL(path.join(root, lock.engine)).href),
    gallery = data.offLock.images.filter((r) => r.role === "gallery_self");
  const references = gallery.map((r) => ({
    referenceId: r.blindId,
    productId: r.productId,
    imageSha256: r.imageSha256,
    vector: data.pairs.get(r.blindId).fit,
  }));
  const catalogueSha256 = sha(
    JSON.stringify(
      gallery.map((r) => ({
        referenceId: r.blindId,
        productId: r.productId,
        imageSha256: r.imageSha256,
      })),
    ),
  );
  const identity = {
    ...LOCAL_EMBEDDING_IDENTITY,
    catalogueSha256,
    preprocessingSha256: sha(
      "aspect-fit-256-srgb-gray127-v1|l2-double-reduction-order-v1|final_emb_1|Float32|1,512",
    ),
  };
  writeJsonExclusive(
    path.join(root, ledger),
    { lockSha256, output: path.relative(root, output), calibrationFits: 1, newModelCalls: 0 },
    root,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  const calibrated = api.createMaxMarginReferenceIndex(
    JSON.stringify({
      ...identity,
      references,
      negatives: data.controls
        .filter((r) => r.role === "calibration_only")
        .map((r) => ({ imageSha256: r.id, vector: r.vector })),
    }),
  );
  assert.equal(calibrated.status, "ready");
  writeJsonExclusive(
    path.join(output, "calibration.json"),
    {
      calibration: calibrated.calibration,
      policy: api.MAX_MARGIN_REFERENCE_POLICY,
      trainingIds: data.controls.filter((r) => r.role === "calibration_only").map((r) => r.id),
      queryIdsUsedForFit: [],
      integrationAllowed: false,
    },
    root,
  );
  const baseline = api.createReferenceEmbeddingIndex(
    JSON.stringify({ ...identity, references, minimumCosine: 0.9, minimumMargin: 0.08 }),
  );
  assert.equal(baseline.status, "ready");
  const enrolled = [...new Set(gallery.map((r) => r.productId))],
    groups = data.offResult.guard.groups.map((g) => g.productIds),
    rows = [];
  const queries = [
    ...data.offResult.rows
      .filter((r) => r.role === "cross_upload")
      .map((r) => ({
        id: r.blindId,
        imageSha256: data.offLock.images.find((x) => x.blindId === r.blindId).imageSha256,
        role: "product",
        productId: r.productId,
        pixel: r.pixel,
        vector: data.pairs.get(r.blindId).fit,
      })),
    ...data.controls
      .filter((r) => r.role !== "calibration_only")
      .map((r) => ({
        ...r,
        imageSha256: r.id,
        pixel: { status: "unknown" },
        pixelEvidence: "not_measured_control_retrieval_branch_only",
      })),
  ];
  for (const row of queries) {
    const { vector: _, ...record } = row;
    const q = JSON.stringify({ ...identity, imageSha256: row.imageSha256, vector: row.vector });
    for (const [arm, index] of [
      ["baseline", baseline],
      ["calibrated", calibrated],
    ]) {
      const embedding = index.compare(q);
      record[`${arm}Embedding`] = embedding;
      record[arm] = api.fuseMonotoneReferenceIdentityEvidence(
        JSON.stringify({
          pixelImageSha256: row.imageSha256,
          embeddingImageSha256: row.imageSha256,
          pixel: lane(row.pixel),
          embedding: lane(embedding),
          enrolledProductIds: enrolled,
          quarantineGroups: groups,
        }),
      );
    }
    if (row.role === "product") {
      const old = data.v2Result.observations.find((r) => r.blindId === row.id);
      assert.deepEqual(record.baselineEmbedding, old.views.fit.embedding);
      assert.deepEqual(record.baseline, old.views.fit.hybrid);
    }
    rows.push(record);
  }
  check();
  const metrics = summarizeCalibrated(rows);
  const saved = writeJsonExclusive(
    path.join(output, "summary.json"),
    {
      schemaVersion: "calibrated-v4-result",
      lockSha256,
      metrics,
      calibration: calibrated.calibration,
      rows,
      controlPlan: lock.controlPlan,
      work: {
        thresholdCalibrationFits: 1,
        newModelCalls: 0,
        newImageCalls: 0,
        newPixelMatches: 0,
        retrievals: 88,
        fusions: 88,
        queryIdsUsedForFit: [],
      },
      scope: "seen_source_ai_development_not_independent_accuracy",
      independentAccuracyEstablished: false,
      integrationAllowed: false,
    },
    root,
  );
  return {
    summary: path.relative(root, saved.path),
    sha256: saved.sha256,
    metrics,
    calibration: calibrated.calibration,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let result;
  if (args.length === 2 && args[0] === "--freeze") result = await freezeMaxMargin(args[1]);
  else if (args.length === 4 && args[0] === "--run")
    result = await runMaxMargin(args[1], args[2], args[3]);
  else throw Error("Use --freeze work/new-freeze OR --run lock.json sha work/new-result");
  console.log(JSON.stringify(result));
}
