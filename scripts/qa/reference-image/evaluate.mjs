// Explicit local reference-image engineering experiment. No model, training,
// network, download, user image, catalogue identity claim or app integration.
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
import { validateLocal } from "../local-vision/robustness-corpus.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestFile = "scripts/qa/local-vision/robustness-manifest.json";
const imageDirectory = "work/robustness-corpus-2026-11-07.93wuSo/final-reviewed";
const manifestHash = "b822665aa26031a9f64c16e99fc11b2e12e0c62614c7db7dbd21bb052850ec5f";
const ledgerFile = "work/reference-pixel-v1-attempt.json";
export const EXPERIMENT = Object.freeze({
  id: "reference-pixel-v1",
  gallery: ["bottle-classic", "jar-screw", "box-netgear", "bag-kenya", "cup-hanoi"],
  variants: ["light", "translate", "rotate90", "inset"],
  originals: 32,
  syntheticQueries: 20,
  maximumDecodes: 32,
  maximumExtractions: 52,
  maximumMatches: 52,
  minimumExactRetrievals: 5,
  minimumSyntheticRetrievals: 16,
  maximumWrongOrAmbiguous: 0,
  integrationAllowed: false,
});
const sourceFiles = [
  "shared/domain/src/reference-image-features.ts",
  "shared/domain/src/reference-image-matcher.ts",
  "shared/domain/src/index.ts",
  "shared/domain/src/reference-vision.ts",
  "shared/domain/package.json",
  "shared/domain/src/__tests__/reference-image-features.test.ts",
  "shared/domain/src/__tests__/reference-image-matcher.test.ts",
  "scripts/qa/reference-image/evaluate.mjs",
  "scripts/__tests__/reference-image-evaluator.test.mjs",
  "scripts/qa/local-vision/embedding-control.mjs",
  "scripts/qa/local-vision/embedding-head.mjs",
  "scripts/qa/local-vision/robustness-corpus.mjs",
  "scripts/qa/local-vision/robustness-prior.json",
  "scripts/qa/local-vision/independent-corpus.mjs",
  manifestFile,
  "tsconfig.base.json",
  "shared/domain/tsconfig.json",
  "scripts/qa/protocols/own-pixel-recognition-protocol.md",
  "pnpm-lock.yaml",
];
function sources(cwd) {
  const names = [...sourceFiles, "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/package.json"];
  const visit = (relative) => {
    const file = path.join(cwd, relative);
    const stat = fs.lstatSync(file);
    assert.equal(stat.isSymbolicLink(), false, "linked_loader_source");
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
    } else names.push(relative);
    assert.ok(names.length < 512, "loader_tree_bound");
  };
  visit("node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist");
  return Object.fromEntries(
    names.map((name) => [name, hash(readBounded(path.join(cwd, name), 4_000_000))]),
  );
}
function corpus(cwd) {
  const bytes = readBounded(path.join(cwd, manifestFile));
  assert.equal(hash(bytes), manifestHash, "manifest_drift");
  const manifest = JSON.parse(bytes);
  const directory = checkedWorkFile(imageDirectory, cwd, true);
  validateLocal(manifest, directory);
  assert.equal(manifest.fixtures.length, EXPERIMENT.originals);
  for (const id of EXPERIMENT.gallery) assert.ok(manifest.fixtures.some((row) => row.id === id));
  return { manifest, directory };
}
function decoder() {
  const modulePath = process.env.SHARP_MODULE_PATH;
  assert.ok(modulePath && path.isAbsolute(modulePath), "explicit_sharp_module_required");
  const require = createRequire(import.meta.url);
  const entry = fs.realpathSync(require.resolve(modulePath));
  const sharp = require(entry);
  const sharpRoot = path.dirname(path.dirname(entry));
  const modulesRoot = path.dirname(sharpRoot);
  const files = {};
  let totalBytes = 0;
  const visit = (file) => {
    const stat = fs.lstatSync(file);
    assert.equal(stat.isSymbolicLink(), false, "linked_decoder_artifact");
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name));
      return;
    }
    assert.ok(stat.isFile() && stat.size <= 64_000_000, "decoder_artifact_bound");
    totalBytes += stat.size;
    assert.ok(totalBytes <= 96_000_000 && Object.keys(files).length < 1024, "decoder_tree_bound");
    files[file] = hash(fs.readFileSync(file));
  };
  // Explicit host decoder binding, not a version-string-only promise. Broader
  // OS/Node/transitive runtime integrity remains a trusted local prerequisite.
  visit(sharpRoot);
  for (const name of [
    `sharp-${process.platform}-${process.arch}`,
    `sharp-libvips-${process.platform}-${process.arch}`,
  ])
    visit(path.join(modulesRoot, "@img", name));
  return { sharp, identity: { entry, versions: sharp.versions, files } };
}

export function parseArguments(args) {
  if (args.length === 2 && args[0] === "--freeze") return { mode: "freeze", output: args[1] };
  if (args.length === 4 && args[0] === "--run" && /^[a-f0-9]{64}$/u.test(args[2]))
    return { mode: "run", lock: args[1], lockSha256: args[2], output: args[3] };
  throw new Error(
    "Use --freeze work/new-directory OR --run work/lock.json sha256 work/new-directory",
  );
}

/** Controlled raw-pixel transforms, not independent camera photographs. */
export function transformImage(image, variant) {
  const { width, height, data } = image;
  assert.ok(Number.isInteger(width) && width >= 32 && width <= 512);
  assert.ok(Number.isInteger(height) && height >= 32 && height <= 512);
  assert.ok(data instanceof Uint8Array && data.length === width * height * 3);
  assert.ok(EXPERIMENT.variants.includes(variant));
  const turned = variant === "rotate90";
  const outWidth = turned ? height : width;
  const outHeight = turned ? width : height;
  const out = new Uint8Array(data.length).fill(127);
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      let sourceX = x;
      let sourceY = y;
      if (turned) {
        sourceX = y;
        sourceY = height - 1 - x;
      } else if (variant === "translate") {
        sourceX = x - Math.round(width * 0.04);
        sourceY = y - Math.round(height * 0.03);
      } else if (variant === "inset") {
        sourceX = Math.round((x - width * 0.1) / 0.8);
        sourceY = Math.round((y - height * 0.1) / 0.8);
      }
      if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height) continue;
      for (let channel = 0; channel < 3; channel++) {
        const value = data[(sourceY * width + sourceX) * 3 + channel];
        out[(y * outWidth + x) * 3 + channel] =
          variant === "light" ? Math.min(255, Math.round(value * 0.85 + 15)) : value;
      }
    }
  }
  return { width: outWidth, height: outHeight, data: out };
}

export function summarize(rows, plannedOriginalIds) {
  assert.ok(Array.isArray(plannedOriginalIds) && plannedOriginalIds.length === 32);
  assert.equal(new Set(plannedOriginalIds).size, 32);
  assert.ok(EXPERIMENT.gallery.every((id) => plannedOriginalIds.includes(id)));
  const planned = new Set([
    ...plannedOriginalIds.map((id) => `${id}/original`),
    ...EXPERIMENT.gallery.flatMap((id) => EXPERIMENT.variants.map((variant) => `${id}/${variant}`)),
  ]);
  const exact = rows.filter((row) => row.variant === "original" && row.known);
  const synthetic = rows.filter((row) => row.variant !== "original");
  const outside = rows.filter((row) => row.variant === "original" && !row.known);
  const correct = (row) => row.result.status === "candidate" && row.result.productId === row.id;
  const wrong = (row) =>
    row.result.status === "candidate" && (!row.known || row.result.productId !== row.id);
  const ambiguity = rows.filter((row) => row.result.status === "ambiguous").length;
  const failures = rows.filter((row) => ["failed", "invalid"].includes(row.result.status)).length;
  const exactCorrect = exact.filter(correct).length;
  const syntheticCorrect = synthetic.filter(correct).length;
  const wrongMatches = rows.filter(wrong).length;
  const uniqueKeys = new Set(rows.map((row) => `${row.id}/${row.variant}`));
  const validResult = (row) => {
    if (!row.result || typeof row.result !== "object") return false;
    const status = row.result.status;
    if (!["candidate", "ambiguous", "unknown", "low_detail", "invalid", "failed"].includes(status))
      return false;
    if (status === "candidate") return EXPERIMENT.gallery.includes(row.result.productId);
    return !Object.hasOwn(row.result, "productId");
  };
  const consistentRows =
    uniqueKeys.size === rows.length &&
    rows.every(
      (row) =>
        planned.has(`${row.id}/${row.variant}`) &&
        validResult(row) &&
        typeof row.id === "string" &&
        /^[a-z0-9-]{1,64}$/u.test(row.id) &&
        row.known === EXPERIMENT.gallery.includes(row.id) &&
        (row.variant === "original" || (row.known && EXPERIMENT.variants.includes(row.variant))),
    );
  return {
    originalSources: EXPERIMENT.originals,
    exact: { planned: 5, observed: exact.length, correct: exactCorrect },
    synthetic: { planned: 20, observed: synthetic.length, correct: syntheticCorrect },
    outside: { planned: 27, observed: outside.length, wrong: outside.filter(wrong).length },
    wrongMatches,
    ambiguity,
    failures,
    engineeringGate:
      consistentRows &&
      rows.length === 52 &&
      exact.length === 5 &&
      synthetic.length === 20 &&
      outside.length === 27 &&
      exactCorrect >= EXPERIMENT.minimumExactRetrievals &&
      syntheticCorrect >= EXPERIMENT.minimumSyntheticRetrievals &&
      wrongMatches === 0 &&
      ambiguity === 0 &&
      failures === 0
        ? "pass"
        : "fail",
    productAccuracyEstablished: false,
    integrationAllowed: false,
  };
}

export async function freeze(outputInput, cwd = project) {
  assert.equal(fs.existsSync(path.join(cwd, ledgerFile)), false, "experiment_already_attempted");
  const output = checkedOutput(outputInput, cwd);
  const { manifest } = corpus(cwd);
  const { identity } = decoder();
  const lock = {
    schemaVersion: "reference-pixel-lock-v1",
    experiment: EXPERIMENT,
    sources: sources(cwd),
    manifestSha256: manifestHash,
    images: manifest.fixtures.map(({ id, sha256, bytes }) => ({ id, sha256, bytes })),
    decoderIdentity: identity,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    imageExtractionsBeforeLock: 0,
    referenceStatus: "seen_public_images_ai_reviewed_not_identity_ground_truth",
  };
  fs.mkdirSync(output, { mode: 0o700 });
  const saved = writeJsonExclusive(path.join(output, "lock.json"), lock, cwd);
  return { lock: path.relative(cwd, saved.path), sha256: saved.sha256, imageExtractions: 0 };
}

export async function run(options, cwd = project) {
  const lockBytes = readBounded(checkedWorkFile(options.lock, cwd));
  assert.equal(hash(lockBytes), options.lockSha256, "lock_drift");
  const lock = JSON.parse(lockBytes);
  assert.equal(lock.schemaVersion, "reference-pixel-lock-v1");
  assert.deepEqual(lock.experiment, EXPERIMENT);
  assert.deepEqual(lock.sources, sources(cwd), "source_drift");
  assert.equal(lock.node, process.version);
  assert.equal(lock.platform, `${process.platform}-${process.arch}`);
  const { manifest, directory } = corpus(cwd);
  assert.deepEqual(
    lock.images,
    manifest.fixtures.map(({ id, sha256, bytes }) => ({ id, sha256, bytes })),
  );
  const { sharp, identity } = decoder();
  assert.deepEqual(lock.decoderIdentity, identity, "decoder_drift");
  const output = checkedOutput(options.output, cwd);
  // Canonical once-only marker survives failures; copied locks/new output paths
  // cannot silently create a second measured attempt.
  writeJsonExclusive(
    path.join(cwd, ledgerFile),
    {
      experimentId: EXPERIMENT.id,
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
  const api = await tsImport(
    requireMobile.resolve("@kierratysappi/domain/reference-vision"),
    import.meta.url,
  );
  const catalogue = [];
  const extracted = new Map();
  const rawGallery = new Map();
  const rows = [];
  const counters = {
    decodes: 0,
    extractions: 0,
    matches: 0,
    paidApiCalls: 0,
    pretrainedPredictions: 0,
    fits: 0,
  };
  const begun = performance.now();
  const extract = (image) => {
    assert.ok(++counters.extractions <= EXPERIMENT.maximumExtractions);
    return api.extractReferenceImageFeatures(image);
  };
  for (const fixture of manifest.fixtures) {
    const bytes = readBounded(path.join(directory, `${fixture.id}.jpg`), 2_000_000);
    assert.equal(hash(bytes), fixture.sha256);
    try {
      assert.ok(++counters.decodes <= EXPERIMENT.maximumDecodes);
      const decoded = await sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" })
        .rotate()
        .resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: true })
        .removeAlpha()
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(decoded.info.channels, 3);
      const image = {
        width: decoded.info.width,
        height: decoded.info.height,
        data: new Uint8Array(decoded.data),
      };
      const feature = extract(image);
      extracted.set(fixture.id, feature);
      if (EXPERIMENT.gallery.includes(fixture.id)) {
        rawGallery.set(fixture.id, image);
        if (feature.status === "ok")
          catalogue.push({
            productId: fixture.id,
            referenceId: fixture.id,
            imageSha256: fixture.sha256,
            features: feature.features,
          });
      }
    } catch {
      extracted.set(fixture.id, { status: "failed", reason: "decode_or_extraction_failure" });
    }
  }
  const measure = (id, variant, feature, known) => {
    const start = performance.now();
    let result;
    if (feature.status === "ok") {
      assert.ok(++counters.matches <= EXPERIMENT.maximumMatches);
      result = api.matchReferenceImage(feature.features, catalogue);
    } else result = feature;
    const row = {
      id,
      variant,
      known,
      featureStatus: feature.status,
      keypoints: feature.status === "ok" ? feature.features.keypoints.length : 0,
      result,
      matchDurationMs: performance.now() - start,
    };
    rows.push(row);
    writeJsonExclusive(path.join(output, `${id}-${variant}.json`), row, cwd);
  };
  for (const fixture of manifest.fixtures)
    measure(
      fixture.id,
      "original",
      extracted.get(fixture.id),
      EXPERIMENT.gallery.includes(fixture.id),
    );
  for (const id of EXPERIMENT.gallery) {
    for (const variant of EXPERIMENT.variants) {
      const image = rawGallery.get(id);
      let feature = { status: "failed", reason: "gallery_decode_failed" };
      if (image) {
        try {
          feature = extract(transformImage(image, variant));
        } catch {
          feature = { status: "failed", reason: "transform_or_extraction_failure" };
        }
      }
      measure(id, variant, feature, true);
    }
  }
  assert.deepEqual(lock.sources, sources(cwd), "source_drift_during_run");
  corpus(cwd);
  const plannedIds = manifest.fixtures.map((row) => row.id);
  assert.deepEqual(lock.decoderIdentity, decoder().identity, "decoder_drift_during_run");
  const summary = {
    schemaVersion: "reference-pixel-result-v1",
    lockSha256: options.lockSha256,
    ...summarize(rows, plannedIds),
    catalogueEntries: catalogue.length,
    counters,
    wallMs: performance.now() - begun,
    rows,
  };
  const receipt = writeJsonExclusive(path.join(output, "summary.json"), summary, cwd);
  return {
    output: path.relative(cwd, output),
    sha256: receipt.sha256,
    ...summarize(rows, plannedIds),
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
