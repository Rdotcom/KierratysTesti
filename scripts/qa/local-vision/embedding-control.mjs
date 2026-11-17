// Frozen local QA workflow controls. No model prediction, fitting, network or app access.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { EMBEDDING_CLASSES, EMBEDDING_POLICY } from "./embedding-head.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/u;
const stages = ["images", "fit"];
const stageLimits = {
  images: { maximumImageProcesses: 72, maximumImagePredictions: 144, maximumFits: 0 },
  fit: { maximumImageProcesses: 0, maximumImagePredictions: 0, maximumFits: 1 },
};
const experimentId = "kig-embedding-v2";
const maxBytes = 64 * 1024 * 1024;
const textPath = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 4096 &&
  !/[\p{Cc}\p{Cf}]/u.test(value) &&
  !/^[a-z]+:/iu.test(value);
const statIdentity = (info) => [
  info.dev,
  info.ino,
  info.mode,
  info.nlink,
  info.size,
  info.mtimeNs,
  info.ctimeNs,
];

/** Strict data-only copy, so accessors/proxies cannot silently enter a frozen record. */
function jsonData(input, maximumNodes = 300_000) {
  let nodes = 0;
  const visit = (value, depth) => {
    assert.ok(++nodes <= maximumNodes && depth <= 32, "json_bound");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      assert.ok(Number.isFinite(value), "json_number");
      return value;
    }
    if (typeof value === "string") {
      assert.ok(value.length <= 1_000_000, "json_string");
      return value;
    }
    assert.ok(value && typeof value === "object", "json_type");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      assert.equal(Object.getPrototypeOf(value), Array.prototype, "json_array");
      assert.ok(
        value.length <= 150_000 && Reflect.ownKeys(descriptors).length === value.length + 1,
        "json_array",
      );
      return Array.from({ length: value.length }, (_, i) => {
        const item = descriptors[String(i)];
        assert.ok(item && Object.hasOwn(item, "value"), "json_accessor");
        return visit(item.value, depth + 1);
      });
    }
    assert.ok([Object.prototype, null].includes(Object.getPrototypeOf(value)), "json_object");
    const out = Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
      assert.ok(
        typeof key === "string" && key.length <= 4096 && Object.hasOwn(descriptors[key], "value"),
        "json_accessor",
      );
      out[key] = visit(descriptors[key].value, depth + 1);
    }
    return out;
  };
  return visit(input, 0);
}

/** Canonical regular file, no leaf/intermediate link or hard-link alias; bounded race checks. */
export function readBounded(input, maximum = 2_000_000) {
  return readCheckedFile(input, maximum, true);
}
function readCheckedFile(input, maximum, rejectHardLinks) {
  assert.ok(
    textPath(input) && Number.isSafeInteger(maximum) && maximum > 0 && maximum <= maxBytes,
    "read_bound",
  );
  const file = path.resolve(input);
  assert.equal(fs.realpathSync(file), file, "linked_input");
  const before = fs.lstatSync(file, { bigint: true });
  assert.ok(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink >= 1n &&
      (!rejectHardLinks || before.nlink === 1n) &&
      before.size <= BigInt(maximum),
    "file_bound",
  );
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    assert.ok(isDeepStrictEqual(statIdentity(before), statIdentity(opened)), "file_replaced");
    const buffer = Buffer.alloc(maximum + 1);
    let count = 0;
    while (count < buffer.length) {
      const size = fs.readSync(fd, buffer, count, buffer.length - count, null);
      if (size === 0) break;
      count += size;
      assert.ok(count <= maximum, "growing_file");
    }
    assert.equal(BigInt(count), opened.size, "file_changed");
    assert.ok(
      isDeepStrictEqual(statIdentity(opened), statIdentity(fs.fstatSync(fd, { bigint: true }))),
      "file_changed",
    );
    assert.equal(fs.realpathSync(file), file, "linked_input");
    assert.ok(
      isDeepStrictEqual(statIdentity(opened), statIdentity(fs.lstatSync(file, { bigint: true }))),
      "file_replaced",
    );
    return buffer.subarray(0, count);
  } finally {
    fs.closeSync(fd);
  }
}
function workRoot(cwd) {
  assert.ok(textPath(cwd), "invalid_cwd");
  const root = path.resolve(cwd),
    work = path.join(root, "work");
  assert.equal(fs.realpathSync(root), root, "linked_cwd");
  const info = fs.lstatSync(work);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), "linked_work");
  assert.equal(fs.realpathSync(work), work, "linked_work");
  return work;
}
function withinWork(input, cwd) {
  assert.ok(textPath(input), "invalid_work_path");
  const work = workRoot(cwd),
    file = path.resolve(cwd, input);
  assert.ok(file.startsWith(`${work}${path.sep}`), "outside_work");
  return file;
}
export function checkedWorkFile(input, cwd = project, directory = false) {
  assert.equal(typeof directory, "boolean", "invalid_file_type");
  const file = withinWork(input, cwd),
    info = fs.lstatSync(file);
  assert.equal(fs.realpathSync(file), file, "linked_input");
  assert.ok(
    !info.isSymbolicLink() && (directory ? info.isDirectory() : info.isFile() && info.nlink === 1),
    "not_regular",
  );
  return file;
}
function checkedParent(input, cwd) {
  const file = withinWork(input, cwd),
    parent = path.dirname(file),
    info = fs.lstatSync(parent);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), "linked_parent");
  assert.equal(fs.realpathSync(parent), parent, "linked_parent");
  return file;
}
export function checkedOutput(input, cwd = project) {
  const file = checkedParent(input, cwd);
  assert.equal(fs.lstatSync(file, { throwIfNoEntry: false }), undefined, "output_exists");
  return file;
}
/** Caller may supply cwd only for an explicitly isolated test workspace. */
export function writeJsonExclusive(input, value, cwd = project) {
  const file = checkedOutput(input, cwd),
    safe = jsonData(value);
  const bytes = Buffer.from(`${JSON.stringify(safe, null, 2)}\n`);
  assert.ok(bytes.length > 0 && bytes.length <= maxBytes, "json_output_bound");
  const fd = fs.openSync(
    file,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      (fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    const info = fs.fstatSync(fd, { bigint: true });
    assert.ok(info.isFile() && info.nlink === 1n && info.size === 0n, "output_not_regular");
    fs.writeFileSync(fd, bytes);
    const final = fs.fstatSync(fd, { bigint: true });
    assert.ok(final.size === BigInt(bytes.length) && final.nlink === 1n, "output_changed");
    assert.equal(fs.realpathSync(file), file, "linked_output");
    const actual = fs.lstatSync(file, { bigint: true });
    assert.ok(
      actual.dev === final.dev && actual.ino === final.ino && actual.nlink === 1n,
      "output_replaced",
    );
    return { path: file, bytes, sha256: sha(bytes) };
  } finally {
    fs.closeSync(fd);
  }
}

const exactSpec = {
  schemaVersion: "two-view-learning-spec-v1",
  experimentId,
  referenceStatus: "seen_ai_reviewed_human_review_required",
  worker: {
    binary: "work/embedding-native-2026-11-09.clmnxf/embedding-qa",
    binarySha256: "1c4e9c070a6ea969fabf81dc1f372f4b572dfb83237a4db54ba27113be6e29a5",
    sourceSha256: "f63a4484d8d9a63a3101f6b278df6fb56849c3901fac4822abfd1b7eb03f9099",
    schemaVersion: "mobileclip-s0-two-view-embeddings-v1",
    logicalBudgetMs: 12000,
    outerTimeoutMs: 15000,
    maxOutputBytesPerStream: 524288,
    maximumFailureTelemetryMs: 60000,
  },
  features: {
    modelId: "apple-mobileclip-s0-coreml-2024",
    revision: "55c8098c12ba8f928e37e26b2e1dd097777c3f98",
    centerPolicy: "center-square-256-srgb-v1",
    fitPolicy: "aspect-fit-256-srgb-gray127-v1",
    viewDimensions: 512,
    combinedDimensions: 1024,
    combine: "concat_div_sqrt2",
    unitNormTolerance: 1e-6,
    centerParity: "exact_all_18_all_72",
    fitParity: "exact_all_18_where_captured_16",
    partialViewsAllowed: false,
  },
  head: {
    classes: ["bottle", "jar", "box", "bag", "cup", "unknown"],
    geometry: "raw_unit_no_zscore",
    lambda: 0.1,
    classRowWeight: "1/class_count",
    objective: "sum_of_six_class_mean_squared_errors_plus_l2",
    solver: "dual_ridge_weighted_centering_joint_intercept",
    regularizeIntercept: false,
    minimumRawMargin: 0.1,
    mode: "veto_only_same_as_accepted_baseline",
    maximumObjective: 5,
    maximumSlopeSquaredNorm: 50,
    boundTolerance: 1e-7,
    maximumPrimalNormalResidual: 1e-8,
  },
  execution: {
    cases: 72,
    train: 45,
    validation: 27,
    sameAllocationAsLinearV1: true,
    maximumImageProcesses: 72,
    maximumImagePredictions: 144,
    maximumFits: 1,
    internalSanityRows: 45,
    independentSanityRows: 45,
    maximumHeadDecisions: 72,
    retries: 0,
    paidApiCalls: 0,
    stopAcquisitionAndFitOnAnyPairFailure: true,
    appIntegrationAllowed: false,
  },
  validationGate: {
    maximumWrongAcceptances: 0,
    maximumBaselineCorrectLosses: 0,
    maximumIntroducedFailures: 0,
    maximumIntroducedInvalidOutputs: 0,
    minimumValidWrongRemoved: 1,
    minimumCorrectPositives: 8,
    minimumCorrectPerKnownKind: 1,
  },
};
export function validateEmbeddingSpec(input) {
  const spec = jsonData(input, 500),
    expected = jsonData(exactSpec, 500);
  assert.ok(isDeepStrictEqual(spec, expected), "invalid_embedding_spec");
  assert.ok(isDeepStrictEqual(spec.head.classes, [...EMBEDDING_CLASSES]), "head_class_drift");
  assert.equal(
    spec.features.combinedDimensions,
    EMBEDDING_POLICY.featureCount,
    "head_feature_drift",
  );
  assert.equal(spec.features.viewDimensions, EMBEDDING_POLICY.viewFeatureCount, "head_view_drift");
  assert.ok(
    isDeepStrictEqual(
      [spec.features.centerPolicy, spec.features.fitPolicy],
      [...EMBEDDING_POLICY.preprocessing],
    ),
    "head_preprocessing_drift",
  );
  assert.equal(
    spec.features.unitNormTolerance,
    EMBEDDING_POLICY.unitNormTolerance,
    "head_norm_drift",
  );
  assert.equal(spec.head.lambda, EMBEDDING_POLICY.lambda, "head_lambda_drift");
  assert.equal(spec.head.minimumRawMargin, EMBEDDING_POLICY.rawMargin, "head_margin_drift");
  assert.equal(
    EMBEDDING_POLICY.geometry,
    "raw-unit-no-zscore-weighted-centering-only",
    "head_geometry_drift",
  );
  assert.equal(
    EMBEDDING_POLICY.classWeightPolicy,
    "inverse-class-count-total-six",
    "head_weight_drift",
  );
  assert.equal(
    EMBEDDING_POLICY.interceptPolicy,
    "joint-weighted-unpenalized",
    "head_intercept_drift",
  );
  return spec;
}

/** Complete deterministic source/runtime snapshot; no ledger claim or learned operation. */
export function captureEmbeddingSources(cwd = project) {
  const root = path.resolve(cwd);
  assert.equal(fs.realpathSync(root), root, "linked_cwd");
  const files = {},
    included = new Set();
  let total = 0;
  const add = (relative) => {
    const file = path.join(root, relative);
    // Installed immutable runtime metadata may have a package-cache hard-link
    // alias. This exception is not available to untrusted work/data inputs.
    const bytes =
      relative === "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/package.json"
        ? readCheckedFile(file, 2_000_000, false)
        : readBounded(file);
    assert.ok(!included.has(relative), "duplicate_source");
    included.add(relative);
    total += bytes.length;
    assert.ok(included.size <= 2000 && total <= maxBytes, "source_tree_bound");
    files[relative.split(path.sep).join("/")] = sha(bytes);
  };
  const visit = (relative) => {
    const file = path.join(root, relative),
      info = fs.lstatSync(file);
    assert.ok(!info.isSymbolicLink() && fs.realpathSync(file) === file, "linked_source");
    if (info.isDirectory())
      for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
    else {
      assert.ok(info.isFile(), "nonregular_source");
      if (/\.(?:mjs|swift|json|md|ts|tsx)$/u.test(file)) add(relative);
    }
  };
  for (const tree of ["scripts/qa/local-vision", "shared/contracts/src", "shared/domain/src"])
    visit(tree);
  for (const relative of [
    "scripts/qa/protocols/local-vision-two-view-protocol.md",
    "scripts/qa/protocols/local-vision-linear-protocol.md",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json",
    "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/package.json",
  ])
    add(relative);
  for (const area of ["backend", "mobile", "shared"]) {
    for (const name of fs.readdirSync(path.join(root, area)).sort()) {
      const directory = path.join(root, area, name),
        info = fs.lstatSync(directory);
      assert.ok(!info.isSymbolicLink(), "linked_package");
      if (!info.isDirectory()) continue;
      const relative = path.join(area, name, "package.json");
      if (fs.lstatSync(path.join(root, relative), { throwIfNoEntry: false })) add(relative);
    }
  }
  const sorted = Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const runtime = {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    osRelease: os.release(),
  };
  return {
    files: sorted,
    ...runtime,
    sourceHash: sha(JSON.stringify({ files: sorted, ...runtime })),
  };
}

function stageName(stage) {
  assert.ok(stages.includes(stage), "invalid_embedding_stage");
  return stage;
}
function ledger(cwd) {
  const root = workRoot(cwd),
    directory = path.join(root, "embedding-learning-attempts");
  const present = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (present) {
    assert.ok(present.isDirectory() && !present.isSymbolicLink(), "linked_ledger");
    assert.equal(fs.realpathSync(directory), directory, "linked_ledger");
  }
  return directory;
}
const markerFile = (stage, directory) => path.join(directory, `${experimentId}-${stage}.json`);
function claimOutput(input, cwd) {
  const file = checkedParent(input, cwd),
    info = fs.lstatSync(file, { throwIfNoEntry: false });
  if (info) {
    assert.ok(info.isDirectory() && !info.isSymbolicLink(), "claim_output_not_directory");
    assert.equal(fs.realpathSync(file), file, "linked_claim_output");
  }
  return file;
}
function readImagesClaim(directory, cwd) {
  const file = checkedWorkFile(markerFile("images", directory), cwd),
    bytes = readBounded(file, 30_000);
  const marker = jsonData(JSON.parse(bytes), 100);
  const expectedFields = [
    "schemaVersion",
    "experimentId",
    "stage",
    "lockSha256",
    "output",
    "claimedAt",
    "limits",
    "priorImagesClaimSha256",
  ];
  assert.ok(isDeepStrictEqual(Object.keys(marker).sort(), expectedFields.sort()), "claim_schema");
  assert.equal(marker.schemaVersion, "embedding-stage-claim-v1", "claim_schema");
  assert.equal(marker.experimentId, experimentId, "claim_identity");
  assert.equal(marker.stage, "images", "claim_stage");
  assert.match(marker.lockSha256, hashPattern, "claim_hash");
  assert.equal(claimOutput(marker.output, cwd), marker.output, "claim_output_not_canonical");
  assert.ok(
    typeof marker.claimedAt === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(marker.claimedAt) &&
      Number.isFinite(Date.parse(marker.claimedAt)) &&
      new Date(marker.claimedAt).toISOString() === marker.claimedAt,
    "claim_date",
  );
  assert.ok(isDeepStrictEqual(marker.limits, jsonData(stageLimits.images)), "claim_limits");
  assert.equal(marker.priorImagesClaimSha256, null, "claim_chain");
  return { path: file, marker, bytes, sha256: sha(bytes) };
}
export function assertEmbeddingFresh(cwd = project) {
  const directory = ledger(cwd);
  for (const stage of stages)
    assert.equal(
      fs.lstatSync(markerFile(stage, directory), { throwIfNoEntry: false }),
      undefined,
      "embedding_experiment_already_claimed",
    );
  return directory;
}
export function assertEmbeddingStageAvailable(stage, cwd = project) {
  stageName(stage);
  const directory = ledger(cwd);
  assert.equal(
    fs.lstatSync(markerFile(stage, directory), { throwIfNoEntry: false }),
    undefined,
    "embedding_stage_already_claimed",
  );
  if (stage === "images") assertEmbeddingFresh(cwd);
  else readImagesClaim(directory, cwd);
  return directory;
}
/** An attempt claim is never completion; the runner must independently check image artifacts. */
export function claimEmbeddingStage(stage, options, cwd = project) {
  stageName(stage);
  const data = jsonData(options, 10);
  assert.ok(isDeepStrictEqual(Object.keys(data).sort(), ["lockSha256", "output"]), "claim_options");
  assert.match(data.lockSha256, hashPattern, "claim_hash");
  const output = claimOutput(data.output, cwd),
    directory = assertEmbeddingStageAvailable(stage, cwd);
  const prior = stage === "fit" ? readImagesClaim(directory, cwd) : null;
  if (prior) assert.equal(prior.marker.lockSha256, data.lockSha256, "claim_lock_drift");
  if (!fs.lstatSync(directory, { throwIfNoEntry: false })) fs.mkdirSync(directory, { mode: 0o700 });
  assert.equal(ledger(cwd), directory, "ledger_drift");
  const marker = {
    schemaVersion: "embedding-stage-claim-v1",
    experimentId,
    stage,
    lockSha256: data.lockSha256,
    output,
    claimedAt: new Date().toISOString(),
    limits: stageLimits[stage],
    priorImagesClaimSha256: prior?.sha256 ?? null,
  };
  const result = writeJsonExclusive(markerFile(stage, directory), marker, cwd);
  return { ...result, marker };
}
