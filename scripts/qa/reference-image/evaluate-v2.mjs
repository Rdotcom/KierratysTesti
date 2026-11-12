// Explicit expanded SEEN reference-image comparison. No downloads, ML model,
// identity labels, app integration, hidden retries or modification of V1 evidence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  checkedOutput,
  checkedWorkFile,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import { validateLocal as validateRobustness } from "../local-vision/robustness-corpus.mjs";
import { validateLocal as validateSpatial } from "../local-vision/spatial-data-corpus.mjs";
import { transformImage as transformV1 } from "./evaluate.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/u;
const idPattern = /^[a-z][a-z0-9-]{0,63}$/u;
const ledger = "work/reference-pixel-v2-attempt.json";
export const EXPERIMENT_V2 = Object.freeze({
  id: "reference-pixel-v2",
  engines: Object.freeze(["v1", "v2"]),
  gallery: Object.freeze([
    "bottle-classic",
    "jar-screw",
    "box-netgear",
    "bag-kenya",
    "cup-hanoi",
    "bottle-banks",
    "jar-saffron",
    "box-juul",
    "bag-coffee",
    "cup-coffee2025",
  ]),
  variants: Object.freeze(["light", "translate", "rotate90", "inset80", "inset60", "combo60"]),
  originals: 52,
  syntheticQueriesPerEngine: 60,
  queriesPerEngine: 112,
  maximumDecodes: 52,
  maximumExtractions: 224,
  maximumMatches: 224,
  minimumV2SelfRetrievals: 10,
  minimumAdditionalSyntheticCorrect: 6,
  maximumV2Wrong: 0,
  maximumV2InvalidOrFailed: 0,
  maximumV1CorrectLosses: 0,
  integrationAllowed: false,
});
const corpora = [
  {
    name: "robustness",
    manifest: "scripts/qa/local-vision/robustness-manifest.json",
    directory: "work/robustness-corpus-2026-11-07.93wuSo/final-reviewed",
    sha256: "b822665aa26031a9f64c16e99fc11b2e12e0c62614c7db7dbd21bb052850ec5f",
    count: 32,
    validate: validateRobustness,
  },
  {
    name: "spatial",
    manifest: "scripts/qa/local-vision/spatial-data-manifest.json",
    directory: "work/spatial-data-2026-11-07.P8gFzP/final-reviewed",
    sha256: "e6567b3d7ba522e59787fc9ff0419950c36755ee789a36b673728ab598401220",
    count: 20,
    validate: validateSpatial,
  },
];
const priorEvidence = [
  [
    "work/reference-pixel-v1-attempt.json",
    "cda5897f38a6b4707d54068e36230cbfd3f3dc185ba9f9a9fdfb92201cd02dd8",
  ],
  [
    "work/own-pixel-2026-11-10.j6ExSM/freeze/lock.json",
    "1754502d7558847885536f5f73d36c00322c5e56003e2dc93b4aeb9deef276e0",
  ],
  [
    "work/own-pixel-2026-11-10.j6ExSM/result/summary.json",
    "6e1ec4840200290b785e6d7319c2d0c33a88b1de358ee8276b2b1b6ef325e051",
  ],
];
function prior(cwd) {
  const saved = Object.fromEntries(
    priorEvidence.map(([name, expected]) => {
      const bytes = readBounded(checkedWorkFile(name, cwd), 4_000_000);
      assert.equal(sha(bytes), expected, "prior_v1_evidence_drift");
      return [name, expected];
    }),
  );
  const oldLock = JSON.parse(readBounded(checkedWorkFile(priorEvidence[1][0], cwd)));
  for (const name of [
    "shared/domain/src/reference-image-features.ts",
    "shared/domain/src/reference-image-matcher.ts",
    "scripts/qa/reference-image/evaluate.mjs",
  ])
    assert.equal(
      sha(readBounded(path.join(cwd, name))),
      oldLock.sources[name],
      "v1_algorithm_drift",
    );
  return saved;
}
function sources(cwd) {
  const names = [
    "shared/domain/package.json",
    "shared/domain/tsconfig.json",
    "tsconfig.base.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "docs/final/OWN_PIXEL_V2_PROTOCOL.md",
    "scripts/__tests__/reference-image-evaluator.test.mjs",
    "scripts/__tests__/reference-image-evaluator-v2.test.mjs",
    "scripts/qa/local-vision/embedding-control.mjs",
    "scripts/qa/local-vision/embedding-head.mjs",
    "scripts/qa/local-vision/robustness-corpus.mjs",
    "scripts/qa/local-vision/robustness-prior.json",
    "scripts/qa/local-vision/spatial-data-corpus.mjs",
    "scripts/qa/local-vision/spatial-data-prior.json",
    "scripts/qa/local-vision/independent-corpus.mjs",
    ...corpora.map((entry) => entry.manifest),
    "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/package.json",
  ];
  const visit = (name) => {
    const info = fs.lstatSync(path.join(cwd, name));
    assert.equal(info.isSymbolicLink(), false, "linked_source");
    if (info.isDirectory())
      for (const child of fs.readdirSync(path.join(cwd, name)).sort())
        visit(path.join(name, child));
    else names.push(name);
    assert.ok(names.length < 1024, "source_tree_bound");
  };
  for (const tree of [
    "shared/domain/src",
    "scripts/qa/reference-image",
    "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist",
  ])
    visit(tree);
  assert.equal(new Set(names).size, names.length, "duplicate_source");
  return Object.fromEntries(
    names.sort().map((name) => [name, sha(readBounded(path.join(cwd, name), 4_000_000))]),
  );
}
function corpus(cwd) {
  const rows = [];
  for (const entry of corpora) {
    const bytes = readBounded(path.join(cwd, entry.manifest));
    assert.equal(sha(bytes), entry.sha256, "manifest_drift");
    const manifest = JSON.parse(bytes);
    const directory = checkedWorkFile(entry.directory, cwd, true);
    entry.validate(manifest, directory);
    assert.equal(manifest.fixtures.length, entry.count);
    for (const fixture of manifest.fixtures)
      rows.push({
        ...fixture,
        corpus: entry.name,
        file: path.join(directory, `${fixture.id}.jpg`),
      });
  }
  createPlan(rows.map((row) => row.id));
  assert.equal(new Set(rows.map((row) => row.sha256)).size, 52, "duplicate_source_image");
  return rows;
}
function decoder() {
  const modulePath = process.env.SHARP_MODULE_PATH;
  assert.ok(modulePath && path.isAbsolute(modulePath), "explicit_sharp_module_required");
  const require = createRequire(import.meta.url);
  const entry = fs.realpathSync(require.resolve(modulePath));
  const sharp = require(entry);
  const root = path.dirname(path.dirname(entry));
  const files = {};
  let total = 0;
  const visit = (file) => {
    const info = fs.lstatSync(file);
    assert.equal(info.isSymbolicLink(), false, "linked_decoder_artifact");
    if (info.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name));
      return;
    }
    assert.ok(info.isFile() && info.size <= 64_000_000, "decoder_artifact_bound");
    total += info.size;
    assert.ok(total <= 96_000_000 && Object.keys(files).length < 1024, "decoder_tree_bound");
    files[file] = sha(fs.readFileSync(file));
  };
  visit(root);
  for (const name of [
    `sharp-${process.platform}-${process.arch}`,
    `sharp-libvips-${process.platform}-${process.arch}`,
  ])
    visit(path.join(path.dirname(root), "@img", name));
  return { sharp, identity: { entry, versions: sharp.versions, files } };
}
export function parseArguments(args) {
  if (args.length === 2 && args[0] === "--freeze") return { mode: "freeze", output: args[1] };
  if (args.length === 4 && args[0] === "--run" && hashPattern.test(args[2]))
    return { mode: "run", lock: args[1], lockSha256: args[2], output: args[3] };
  throw new Error(
    "Use --freeze work/new-directory OR --run work/lock.json sha256 work/new-directory",
  );
}
export function createPlan(originalIds) {
  assert.ok(
    Array.isArray(originalIds) &&
      originalIds.length === 52 &&
      originalIds.every((id) => typeof id === "string" && idPattern.test(id)),
    "invalid_original_plan",
  );
  assert.equal(new Set(originalIds).size, 52, "duplicate_original_plan");
  assert.ok(
    EXPERIMENT_V2.gallery.every((id) => originalIds.includes(id)),
    "missing_gallery_original",
  );
  const queries = [
    ...originalIds.map((id) => ({
      id,
      variant: "original",
      known: EXPERIMENT_V2.gallery.includes(id),
    })),
    ...EXPERIMENT_V2.gallery.flatMap((id) =>
      EXPERIMENT_V2.variants.map((variant) => ({ id, variant, known: true })),
    ),
  ];
  return EXPERIMENT_V2.engines.flatMap((engine) => queries.map((query) => ({ engine, ...query })));
}
export function transformImage(image, variant) {
  assert.ok(EXPERIMENT_V2.variants.includes(variant), "unsupported_transform");
  if (variant === "inset80") return transformV1(image, "inset");
  if (["light", "translate", "rotate90"].includes(variant)) return transformV1(image, variant);
  const { width, height, data } = image;
  assert.ok(
    Number.isInteger(width) &&
      width >= 32 &&
      width <= 512 &&
      Number.isInteger(height) &&
      height >= 32 &&
      height <= 512,
    "image_dimensions",
  );
  assert.ok(data instanceof Uint8Array && data.length === width * height * 3, "image_data");
  const out = new Uint8Array(data.length).fill(127);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sourceX = Math.round((x - width * 0.2) / 0.6);
      const sourceY = Math.round((y - height * 0.2) / 0.6);
      if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height) continue;
      for (let channel = 0; channel < 3; channel++)
        out[(y * width + x) * 3 + channel] = data[(sourceY * width + sourceX) * 3 + channel];
    }
  const inset = { width, height, data: out };
  return variant === "combo60" ? transformV1(transformV1(inset, "rotate90"), "light") : inset;
}

const key = (row) => `${row.engine}/${row.id}/${row.variant}`;
const correct = (row) =>
  row.known && row.result.status === "candidate" && row.result.productId === row.id;
function validRow(row, plan) {
  const expected = plan.get(key(row));
  if (!expected || row.known !== expected.known || !row.result || typeof row.result !== "object")
    return false;
  const { status } = row.result;
  if (!["candidate", "ambiguous", "unknown", "low_detail", "invalid", "failed"].includes(status))
    return false;
  if (
    status === "candidate"
      ? !EXPERIMENT_V2.gallery.includes(row.result.productId)
      : Object.hasOwn(row.result, "productId")
  )
    return false;
  if (status === "ambiguous") {
    const ids = row.result.productIds;
    if (
      !Array.isArray(ids) ||
      ids.length < 2 ||
      ids.length > 10 ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => EXPERIMENT_V2.gallery.includes(id))
    )
      return false;
  } else if (Object.hasOwn(row.result, "productIds")) return false;
  if (
    !["candidate", "ambiguous"].includes(status) &&
    (typeof row.result.reason !== "string" ||
      row.result.reason.length < 1 ||
      row.result.reason.length > 128)
  )
    return false;
  if (!["ok", "low_detail", "invalid", "failed"].includes(row.featureStatus)) return false;
  const attempts = row.attempts;
  if (!attempts || ![0, 1].includes(attempts.extractions) || ![0, 1].includes(attempts.matches))
    return false;
  if (row.featureStatus === "ok")
    return status !== "low_detail" && attempts.extractions === 1 && attempts.matches === 1;
  return (
    status === row.featureStatus &&
    attempts.matches === 0 &&
    (row.featureStatus === "failed" || attempts.extractions === 1)
  );
}
export function summarizeComparison(input, originalIds) {
  const planned = createPlan(originalIds);
  const plan = new Map(planned.map((row) => [key(row), row]));
  let rows = [];
  let complete = false;
  try {
    assert.ok(Array.isArray(input) && input.length <= 224);
    assert.ok(input.every((row) => row && typeof row === "object" && validRow(row, plan)));
    assert.equal(new Set(input.map(key)).size, input.length);
    rows = input;
    complete = rows.length === planned.length;
  } catch {
    /* Malformed receipts fail the gate; never certify substituted rows. */
  }
  const stats = (engine) => {
    const own = rows.filter((row) => row.engine === engine);
    const exact = own.filter((row) => row.known && row.variant === "original");
    const synthetic = own.filter((row) => row.variant !== "original");
    const outside = own.filter((row) => !row.known);
    return {
      observed: own.length,
      planned: 112,
      exact: { observed: exact.length, planned: 10, correct: exact.filter(correct).length },
      synthetic: {
        observed: synthetic.length,
        planned: 60,
        correct: synthetic.filter(correct).length,
      },
      outside: {
        observed: outside.length,
        planned: 42,
        wrong: outside.filter((row) => row.result.status === "candidate").length,
      },
      wrong: own.filter((row) => row.result.status === "candidate" && !correct(row)).length,
      ambiguous: own.filter((row) => row.result.status === "ambiguous").length,
      invalid: own.filter((row) => row.result.status === "invalid").length,
      failed: own.filter((row) => row.result.status === "failed").length,
      lowDetail: own.filter((row) => row.featureStatus === "low_detail").length,
      extractions: own.reduce((sum, row) => sum + row.attempts.extractions, 0),
      matches: own.reduce((sum, row) => sum + row.attempts.matches, 0),
    };
  };
  const v1 = stats("v1"),
    v2 = stats("v2");
  const indexed = new Map(rows.map((row) => [key(row), row]));
  const losses = rows
    .filter(
      (row) =>
        row.engine === "v1" &&
        correct(row) &&
        !correct(indexed.get(`v2/${row.id}/${row.variant}`) ?? { known: false }),
    )
    .map((row) => `${row.id}/${row.variant}`);
  const additionalSyntheticCorrect = v2.synthetic.correct - v1.synthetic.correct;
  return {
    plannedRows: 224,
    observedRows: Array.isArray(input) ? input.length : 0,
    completeAndValid: complete,
    originalSources: 52,
    syntheticQueriesPerEngine: 60,
    v1,
    v2,
    v1CorrectLosses: losses,
    additionalSyntheticCorrect,
    engineeringGate:
      complete &&
      v1.invalid === 0 &&
      v1.failed === 0 &&
      v2.wrong === 0 &&
      v2.invalid === 0 &&
      v2.failed === 0 &&
      v2.exact.correct === 10 &&
      losses.length === 0 &&
      additionalSyntheticCorrect >= 6
        ? "pass"
        : "fail",
    productAccuracyEstablished: false,
    integrationAllowed: false,
  };
}

export async function freeze(outputInput, cwd = project) {
  assert.equal(
    fs.lstatSync(path.join(cwd, ledger), { throwIfNoEntry: false }),
    undefined,
    "experiment_already_attempted",
  );
  const output = checkedOutput(outputInput, cwd),
    fixtures = corpus(cwd),
    priorV1 = prior(cwd),
    { identity } = decoder();
  const lock = {
    schemaVersion: "reference-pixel-comparison-lock-v2",
    experiment: EXPERIMENT_V2,
    sources: sources(cwd),
    priorV1,
    images: fixtures.map(({ id, sha256, bytes, corpus: source }) => ({
      id,
      sha256,
      bytes,
      source,
    })),
    plan: createPlan(fixtures.map((row) => row.id)),
    decoderIdentity: identity,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    imageExtractionsBeforeLock: 0,
    referenceStatus: "expanded_seen_public_images_ai_reviewed_not_identity_ground_truth",
  };
  fs.mkdirSync(output, { mode: 0o700 });
  const saved = writeJsonExclusive(path.join(output, "lock.json"), lock, cwd);
  return {
    lock: path.relative(cwd, saved.path),
    sha256: saved.sha256,
    imageExtractions: 0,
    plannedRows: 224,
  };
}
export async function run(options, cwd = project) {
  const lockBytes = readBounded(checkedWorkFile(options.lock, cwd), 4_000_000);
  assert.equal(sha(lockBytes), options.lockSha256, "lock_drift");
  const lock = JSON.parse(lockBytes),
    fixtures = corpus(cwd),
    priorV1 = prior(cwd),
    { sharp, identity } = decoder();
  assert.equal(lock.schemaVersion, "reference-pixel-comparison-lock-v2");
  assert.deepEqual(lock.experiment, EXPERIMENT_V2);
  assert.deepEqual(lock.sources, sources(cwd), "source_drift");
  assert.deepEqual(lock.priorV1, priorV1, "prior_v1_evidence_drift");
  assert.deepEqual(
    lock.images,
    fixtures.map(({ id, sha256, bytes, corpus: source }) => ({ id, sha256, bytes, source })),
  );
  const ids = fixtures.map((row) => row.id);
  assert.deepEqual(lock.plan, createPlan(ids));
  assert.deepEqual(lock.decoderIdentity, identity, "decoder_drift");
  assert.equal(lock.node, process.version);
  assert.equal(lock.platform, `${process.platform}-${process.arch}`);
  const output = checkedOutput(options.output, cwd);
  writeJsonExclusive(
    path.join(cwd, ledger),
    {
      experimentId: EXPERIMENT_V2.id,
      lockSha256: options.lockSha256,
      output: path.relative(cwd, output),
    },
    cwd,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  const { tsImport } = await import(
    pathToFileURL(
      path.join(cwd, "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/esm/api/index.mjs"),
    ).href
  );
  const requireMobile = createRequire(path.join(cwd, "mobile/app/package.json"));
  const domainEntry = fs.realpathSync(
    requireMobile.resolve("@kierratysappi/domain/reference-vision"),
  );
  assert.equal(
    domainEntry,
    path.join(cwd, "shared/domain/src/reference-vision.ts"),
    "unfrozen_domain_entry",
  );
  const api = await tsImport(domainEntry, import.meta.url);
  const engines = {
    v1: { extract: api.extractReferenceImageFeatures, match: api.matchReferenceImage },
    v2: { extract: api.extractReferenceImageFeaturesV2, match: api.matchReferenceImageV2 },
  };
  for (const engine of Object.values(engines))
    assert.ok(
      typeof engine.extract === "function" && typeof engine.match === "function",
      "missing_engine_entry",
    );
  const counters = {
    decodes: 0,
    extractions: 0,
    matches: 0,
    v1: { extractions: 0, matches: 0 },
    v2: { extractions: 0, matches: 0 },
    pretrainedPredictions: 0,
    fits: 0,
    paidApiCalls: 0,
  };
  const featureMap = new Map(),
    rawGallery = new Map(),
    rows = [],
    acquisitions = [];
  const begun = performance.now();
  const extractPair = (id, variant, image) => {
    for (const engine of EXPERIMENT_V2.engines) {
      let feature = { status: "failed", reason: "source_decode_or_transform_failed" },
        attempted = 0;
      const start = performance.now();
      if (image) {
        assert.ok(++counters.extractions <= EXPERIMENT_V2.maximumExtractions, "extraction_budget");
        counters[engine].extractions++;
        attempted = 1;
        try {
          feature = engines[engine].extract(image);
        } catch {
          feature = { status: "failed", reason: "extraction_threw" };
        }
      }
      const record = {
        feature,
        attempts: { extractions: attempted, matches: 0 },
        durationMs: performance.now() - start,
      };
      featureMap.set(`${engine}/${id}/${variant}`, record);
      writeJsonExclusive(
        path.join(output, `${engine}-${id}-${variant}-extraction.json`),
        {
          engine,
          id,
          variant,
          status: feature.status,
          keypoints: feature.status === "ok" ? feature.features.keypoints.length : 0,
          featureSha256: sha(JSON.stringify(feature)),
          ...record.attempts,
          durationMs: record.durationMs,
        },
        cwd,
      );
    }
  };
  for (const fixture of fixtures) {
    const bytes = readBounded(fixture.file, 2_000_000);
    assert.equal(sha(bytes), fixture.sha256, "image_drift");
    assert.ok(++counters.decodes <= EXPERIMENT_V2.maximumDecodes, "decode_budget");
    let image,
      status = "failed";
    try {
      const decoded = await sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" })
        .rotate()
        .resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: true })
        .removeAlpha()
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(decoded.info.channels, 3);
      image = {
        width: decoded.info.width,
        height: decoded.info.height,
        data: new Uint8Array(decoded.data),
      };
      status = "decoded";
    } catch {
      /* Both engines retain this original and its planned denominator. */
    }
    const acquisition = { id: fixture.id, imageSha256: fixture.sha256, status, decodeAttempts: 1 };
    acquisitions.push(acquisition);
    writeJsonExclusive(path.join(output, `${fixture.id}-decode.json`), acquisition, cwd);
    extractPair(fixture.id, "original", image);
    if (image && EXPERIMENT_V2.gallery.includes(fixture.id)) rawGallery.set(fixture.id, image);
  }
  for (const id of EXPERIMENT_V2.gallery)
    for (const variant of EXPERIMENT_V2.variants) {
      let image;
      try {
        const original = rawGallery.get(id);
        if (original) image = transformImage(original, variant);
      } catch {
        /* Retain both planned engine observations as operational failures. */
      }
      extractPair(id, variant, image);
    }
  const catalogues = Object.fromEntries(
    EXPERIMENT_V2.engines.map((engine) => [
      engine,
      fixtures
        .filter((row) => EXPERIMENT_V2.gallery.includes(row.id))
        .flatMap((fixture) => {
          const feature = featureMap.get(`${engine}/${fixture.id}/original`).feature;
          return feature.status === "ok"
            ? [
                {
                  productId: fixture.id,
                  referenceId: fixture.id,
                  imageSha256: fixture.sha256,
                  features: feature.features,
                },
              ]
            : [];
        }),
    ]),
  );
  for (const observation of lock.plan) {
    const prepared = featureMap.get(key(observation));
    let result = prepared.feature;
    const attempts = { ...prepared.attempts };
    const start = performance.now();
    if (prepared.feature.status === "ok") {
      assert.ok(++counters.matches <= EXPERIMENT_V2.maximumMatches, "match_budget");
      counters[observation.engine].matches++;
      attempts.matches = 1;
      try {
        result = engines[observation.engine].match(
          prepared.feature.features,
          catalogues[observation.engine],
        );
      } catch {
        result = { status: "failed", reason: "matcher_threw" };
      }
    }
    const row = {
      ...observation,
      featureStatus: prepared.feature.status,
      featureSha256: sha(JSON.stringify(prepared.feature)),
      keypoints: prepared.feature.status === "ok" ? prepared.feature.features.keypoints.length : 0,
      result,
      attempts,
      extractionDurationMs: prepared.durationMs,
      matchDurationMs: performance.now() - start,
    };
    rows.push(row);
    writeJsonExclusive(
      path.join(
        output,
        `${observation.engine}-${observation.id}-${observation.variant}-result.json`,
      ),
      row,
      cwd,
    );
  }
  const measured = summarizeComparison(rows, ids);
  for (const engine of EXPERIMENT_V2.engines)
    assert.deepEqual(
      counters[engine],
      { extractions: measured[engine].extractions, matches: measured[engine].matches },
      "counter_receipt_mismatch",
    );
  assert.deepEqual(lock.sources, sources(cwd), "source_drift_during_run");
  assert.deepEqual(lock.priorV1, prior(cwd), "prior_v1_evidence_drift");
  corpus(cwd);
  assert.deepEqual(lock.decoderIdentity, decoder().identity, "decoder_drift_during_run");
  const summary = {
    schemaVersion: "reference-pixel-comparison-result-v2",
    lockSha256: options.lockSha256,
    ...measured,
    counters,
    catalogueEntries: Object.fromEntries(
      EXPERIMENT_V2.engines.map((engine) => [engine, catalogues[engine].length]),
    ),
    acquisitions,
    rows,
    wallMs: performance.now() - begun,
  };
  const saved = writeJsonExclusive(path.join(output, "summary.json"), summary, cwd);
  return {
    output: path.relative(cwd, output),
    sha256: saved.sha256,
    ...measured,
    counters,
    wallMs: summary.wallMs,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  console.log(
    JSON.stringify(
      options.mode === "freeze" ? await freeze(options.output) : await run(options),
      null,
      2,
    ),
  );
}
