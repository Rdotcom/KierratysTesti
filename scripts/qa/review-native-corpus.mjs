// Separate receipt/accounting implementation. NO recognition/model imports.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDefault = fileURLToPath(new URL("../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const command = {
  capabilities: "--reference-capabilities",
  hashes: "--reference-hash-stdin",
  encodes: "--reference-encode-stdin",
  decodes: "--reference-rgb-stdin",
};
export function nativeEvidencePath(file, root) {
  assert.ok(
    typeof file === "string" && !path.isAbsolute(file) && !file.split("/").includes(".."),
    "evidence_path",
  );
  if (file.startsWith("work/")) return path.join(root, file);
  assert.ok(
    /^(?:shared\/(?:domain|contracts)\/src\/|mobile\/app\/(?:src\/features\/local-vision\/|modules\/local-vision\/ios\/)|scripts\/(?:qa\/|__tests__\/)|docs\/final\/NATIVE_CORPUS_PROTOCOL\.md$|package\.json$|pnpm-lock\.yaml$)/u.test(
      file,
    ),
    "source_scope",
  );
  assert.ok(/\.(?:ts|mjs|swift|json|yaml|md|txt)$/u.test(file), "source_type");
  return path.join(root, file);
}
function readEvidence(file, maximum, root) {
  assert.ok(Number.isSafeInteger(maximum) && maximum > 0 && maximum <= 24000000);
  const target = nativeEvidencePath(file, root);
  assert.equal(fs.realpathSync(target), target, "linked_evidence");
  const before = fs.lstatSync(target, { bigint: true });
  assert.ok(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1n &&
      before.size <= BigInt(maximum),
  );
  const identity = (s) => [s.dev, s.ino, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs];
  const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    assert.deepEqual(identity(fs.fstatSync(fd, { bigint: true })), identity(before));
    const bytes = Buffer.alloc(maximum + 1);
    let count = 0;
    while (count < bytes.length) {
      const size = fs.readSync(fd, bytes, count, bytes.length - count, null);
      if (!size) break;
      count += size;
      assert.ok(count <= maximum, "growing_evidence");
    }
    assert.equal(BigInt(count), before.size);
    assert.deepEqual(identity(fs.fstatSync(fd, { bigint: true })), identity(before));
    assert.deepEqual(identity(fs.lstatSync(target, { bigint: true })), identity(before));
    return bytes.subarray(0, count);
  } finally {
    fs.closeSync(fd);
  }
}
export function checkNativeVector(value, identity, imageSha256) {
  assert.deepEqual(
    Object.keys(value).sort(),
    ["imageSha256", "encoderSha256", "preprocessingSha256", "vector"].sort(),
  );
  assert.equal(value.imageSha256, imageSha256);
  assert.equal(value.encoderSha256, identity.encoderSha256);
  assert.equal(value.preprocessingSha256, identity.preprocessingSha256);
  assert.ok(
    Array.isArray(value.vector) &&
      value.vector.length === 512 &&
      value.vector.every((n) => typeof n === "number" && Number.isFinite(n)),
  );
  assert.ok(Math.abs(Math.hypot(...value.vector) - 1) < 0.00001, "vector_norm");
  return sha(JSON.stringify(value.vector));
}
export function checkNativeRgb(value, imageSha256) {
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      "schemaVersion",
      "imageSha256",
      "decoderPolicy",
      "width",
      "height",
      "channels",
      "rgbBase64",
    ].sort(),
  );
  assert.equal(value.schemaVersion, "native-reference-rgb-v1");
  assert.equal(value.imageSha256, imageSha256);
  assert.equal(value.decoderPolicy, "imageio-oriented-fit-1024-srgb-rgb-v1");
  assert.equal(value.channels, 3);
  assert.ok(
    Number.isInteger(value.width) &&
      Number.isInteger(value.height) &&
      value.width > 0 &&
      value.height > 0 &&
      value.width <= 1024 &&
      value.height <= 1024,
  );
  assert.ok(typeof value.rgbBase64 === "string" && value.rgbBase64.length <= 4194304);
  const bytes = Buffer.from(value.rgbBase64, "base64");
  assert.equal(bytes.length, value.width * value.height * 3);
  assert.equal(bytes.toString("base64"), value.rgbBase64);
}
export function recountNativeMetrics(rows, previousAgreements) {
  assert.equal(rows.length, 45);
  assert.equal(new Set(rows.map((r) => r.id)).size, 45);
  const product = rows.filter((r) => r.role === "product"),
    others = rows.filter((r) => r.role !== "product");
  assert.equal(product.length, 12);
  assert.equal(others.length, 33);
  const isCorrect = (r) =>
    r.result?.status === "candidate" &&
    Array.isArray(r.result.productIds) &&
    r.result.productIds.length === 1 &&
    r.result.productIds[0] === r.productId;
  const correct = product.filter(isCorrect),
    wrong = product.filter((r) => r.result?.status === "candidate" && !isCorrect(r));
  const lost = previousAgreements.filter((id) => !product.some((r) => r.id === id && isCorrect(r)));
  const failed = rows.filter(
    (r) => !["candidate", "ambiguous", "unknown"].includes(r.result?.status),
  );
  const nonUnknown = others.filter((r) => r.result?.status !== "unknown");
  return {
    planned: rows.length,
    productQueries: product.length,
    sourceAgreements: correct.length,
    sourceDisagreements: wrong.length,
    ambiguous: product.filter((r) => r.result?.status === "ambiguous").length,
    unknown: product.filter((r) => r.result?.status === "unknown").length,
    agreementProducts: [...new Set(correct.map((r) => r.productId))],
    priorAgreementLosses: lost,
    disagreementIds: wrong.map((r) => r.id),
    controlNonUnknowns: nonUnknown.map((r) => ({
      id: r.id,
      role: r.role,
      status: r.result?.status ?? "not_attempted",
    })),
    failures: failed.map((r) => r.id),
    engineeringParityPassed:
      correct.length >= 7 && !wrong.length && !lost.length && !nonUnknown.length && !failed.length,
    independentAccuracyEstablished: false,
    integrationAllowed: false,
  };
}
export function reviewNativeCorpus(
  lockFile,
  lockSha256,
  summaryFile,
  summarySha256,
  root = rootDefault,
) {
  const read = (file, max = 4300000) => readEvidence(file, max, root);
  const load = (file) => JSON.parse(read(file));
  assert.equal(sha(read(lockFile)), lockSha256);
  assert.equal(sha(read(summaryFile)), summarySha256);
  const lock = load(lockFile),
    result = load(summaryFile),
    directory = path.posix.dirname(summaryFile);
  assert.equal(lock.schemaVersion, "native-corpus-lock-v1");
  assert.equal(result.schemaVersion, "native-corpus-result-v1");
  assert.equal(result.lockSha256, lockSha256);
  assert.equal(result.failure, null);
  for (const pins of [
    lock.sources,
    lock.inputPins,
    lock.resourcePins,
    lock.jsPins,
    { [lock.binary]: lock.binarySha256 },
  ]) {
    for (const [file, digest] of Object.entries(pins))
      assert.equal(sha(read(file, 24000000)), digest, "pin_mismatch");
  }
  const manifest = lock.manifest,
    catalogueHash = sha(JSON.stringify(manifest));
  assert.equal(lock.serializedManifestSha256, catalogueHash);
  assert.equal(result.compilation.catalogueSha256, catalogueHash);
  assert.equal(result.compilation.status, "ready");
  assert.equal(result.compilation.referenceCount, 8);
  assert.equal(result.compilation.calibrationCount, 40);
  const training = lock.rows.filter((r) => ["reference", "calibration_only"].includes(r.role));
  const queries = lock.rows.filter((r) => !["reference", "calibration_only"].includes(r.role));
  assert.equal(training.length, 48);
  assert.equal(queries.length, 45);
  assert.equal(new Set(lock.rows.map((r) => r.imageSha256)).size, 93);
  const trainFamilies = new Set(
    lock.rows.filter((r) => r.split === "train").map((r) => r.sourceFamily),
  );
  assert.ok(
    lock.rows
      .filter((r) => r.split === "validation")
      .every((r) => !trainFamilies.has(r.sourceFamily)),
  );
  let index = 0;
  const counters = { capabilities: 0, hashes: 0, encodes: 0, decodes: 0, processes: 0 };
  function take(kind, inputHash) {
    const i = index++,
      attempt = load(`${directory}/process-${i}-attempt.json`),
      saved = load(`${directory}/process-${i}-result.json`);
    assert.equal(attempt.index, i);
    assert.equal(saved.index, i);
    assert.equal(attempt.kind, kind);
    assert.equal(saved.kind, kind);
    assert.equal(attempt.command, command[kind]);
    assert.equal(attempt.lockSha256, lockSha256);
    assert.equal(attempt.inputSha256, inputHash);
    assert.equal(saved.status, 0);
    assert.equal(saved.reason, null);
    assert.equal(saved.signal, null);
    assert.equal(saved.errorCode, null);
    const raw = {};
    for (const stream of ["stdout", "stderr"]) {
      assert.equal(saved[stream].file, `${directory}/process-${i}.${stream}`);
      const bytes = read(saved[stream].file);
      assert.equal(bytes.length, saved[stream].bytes);
      assert.equal(sha(bytes), saved[stream].sha256);
      raw[stream] = bytes;
    }
    assert.ok(raw.stdout.length + raw.stderr.length <= 4300000);
    counters[kind]++;
    counters.processes++;
    return JSON.parse(raw.stdout.toString("utf8"));
  }
  const capability = take("capabilities", sha(Buffer.alloc(0)));
  assert.equal(capability.evidence, "integrity_and_interface_only");
  assert.equal(capability.integrationAllowed, false);
  assert.equal(capability.encoderSha256, manifest.encoderSha256);
  assert.equal(capability.preprocessingSha256, manifest.preprocessingSha256);
  function hashing(digest) {
    assert.equal(take("hashes", digest), digest);
  }
  hashing(catalogueHash);
  function consume(row, rgb) {
    hashing(row.imageSha256);
    const vectorHash = checkNativeVector(
      take("encodes", row.imageSha256),
      manifest,
      row.imageSha256,
    );
    hashing(row.imageSha256);
    hashing(vectorHash);
    if (rgb) {
      checkNativeRgb(take("decodes", row.imageSha256), row.imageSha256);
      hashing(row.imageSha256);
    }
    return vectorHash;
  }
  for (const row of training) consume(row, row.role === "reference");
  for (let i = 0; i < queries.length; i++) {
    const row = queries[i],
      vectorHash = consume(row, true),
      record = result.rows[i],
      value = record.result;
    assert.equal(record.id, row.id);
    assert.equal(record.role, row.role);
    assert.equal(record.productId, row.productId);
    assert.equal(record.imageSha256, row.imageSha256);
    assert.deepEqual(load(`${directory}/query-${i}.json`), record);
    assert.equal(value.queryImageSha256, row.imageSha256);
    assert.equal(value.catalogueSha256, catalogueHash);
    assert.equal(value.vectorSha256, vectorHash);
    assert.equal(value.encoderSha256, manifest.encoderSha256);
    assert.equal(value.preprocessingSha256, manifest.preprocessingSha256);
    assert.equal(value.integrationAllowed, false);
    assert.equal(value.verificationStatus, "inferred");
    assert.equal(value.confidence, "uncalibrated_visual_similarity");
    assert.ok(value.productIds.every((id) => manifest.products.some((p) => p.productId === id)));
    if (value.status === "unknown") assert.equal(value.productIds.length, 0);
    assert.deepEqual(
      value.products,
      manifest.products
        .filter((p) => value.productIds.includes(p.productId))
        .map((p) => ({ ...p, sourceStatus: "source_asserted_pending_review" })),
    );
    assert.deepEqual(
      value.sources,
      manifest.images
        .filter((r) => r.role === "reference" && value.productIds.includes(r.productId))
        .map((r) => r.source),
    );
  }
  assert.equal(index, 480);
  assert.deepEqual(counters, result.calls);
  assert.deepEqual(counters, {
    capabilities: 1,
    hashes: 333,
    encodes: 93,
    decodes: 53,
    processes: 480,
  });
  const metrics = recountNativeMetrics(result.rows, lock.previousAgreements);
  assert.deepEqual(metrics, result.metrics);
  assert.equal(result.status, metrics.engineeringParityPassed ? "passed" : "quality_gate_failed");
  return {
    status: "verified",
    sourcePins: Object.keys(lock.sources).length,
    dataPins: Object.keys(lock.inputPins).length,
    resourcePins: Object.keys(lock.resourcePins).length,
    processReceipts: index,
    counters,
    metrics,
    newModelCalls: 0,
    independentHumanReview: false,
    physicalDeviceEvidence: false,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 6, "use lock lockSha summary summarySha");
  process.stdout.write(`${JSON.stringify(reviewNativeCorpus(...process.argv.slice(2)))}\n`);
}
