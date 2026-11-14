// Independent implementation of receipt accounting and rotation consensus. No ML.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkNativeVector, checkNativeRgb } from "./review-native-corpus.mjs";
import { recountExpandedMetrics } from "./review-expanded-corpus.mjs";
const rootDefault = fileURLToPath(new URL("../../", import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
export function recountOrientation(views) {
  assert.equal(views.length, 4);
  assert.deepEqual(
    views.map((v) => v.rotation),
    [0, 90, 180, 270],
  );
  const values = views.map((v) => v.result),
    failed = values.some((v) => ["invalid", "unavailable"].includes(v.status));
  const products = [...new Set(values.flatMap((v) => v.productIds ?? []))].sort(),
    conflict = values.some((v) => v.status === "ambiguous") || products.length > 1;
  const status = failed
    ? "unavailable"
    : conflict
      ? "ambiguous"
      : products.length
        ? "candidate"
        : "unknown";
  return {
    algorithmVersion: "four-orientation-consensus-v1",
    verificationStatus: "inferred",
    confidence: "uncalibrated_visual_similarity",
    integrationAllowed: false,
    status,
    productIds: failed ? [] : products,
    supportingRotations:
      status === "candidate"
        ? views.filter((v) => v.result.status === "candidate").map((v) => v.rotation)
        : [],
    reason: failed
      ? "required_view_failed"
      : conflict
        ? "conflicting_views"
        : products.length
          ? "consistent_candidate"
          : "no_candidate",
  };
}
export function reviewOrientationCorpus(
  lockFile,
  lockSha256,
  summaryFile,
  summarySha256,
  root = rootDefault,
) {
  const read = (f, maximum = 24_000_000) => {
    assert.ok(typeof f === "string" && !path.isAbsolute(f) && !f.split("/").includes(".."));
    assert.ok(
      /^(?:work\/|shared\/(?:domain|contracts)\/src\/|mobile\/app\/(?:src\/features\/local-vision\/|modules\/local-vision\/ios\/)|scripts\/(?:qa|__tests__)\/|docs\/final\/|package\.json$|pnpm-lock\.yaml$)/u.test(
        f,
      ),
    );
    const target = path.join(root, f);
    assert.equal(fs.realpathSync(target), target);
    const before = fs.lstatSync(target, { bigint: true });
    assert.ok(before.isFile() && before.nlink === 1n && before.size <= BigInt(maximum));
    const b = fs.readFileSync(target),
      after = fs.lstatSync(target, { bigint: true });
    for (const k of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) assert.equal(before[k], after[k]);
    assert.equal(BigInt(b.length), before.size);
    return b;
  };
  const load = (f) => JSON.parse(read(f));
  assert.equal(sha(read(lockFile)), lockSha256);
  assert.equal(sha(read(summaryFile)), summarySha256);
  const lock = load(lockFile),
    result = load(summaryFile),
    dir = path.posix.dirname(summaryFile);
  assert.equal(lock.schemaVersion, "orientation-corpus-lock-v1");
  assert.equal(result.schemaVersion, "orientation-corpus-result-v1");
  assert.equal(result.lockSha256, lockSha256);
  assert.equal(result.failure, null);
  for (const pins of [
    lock.sources,
    lock.inputPins,
    lock.parent.resourcePins,
    lock.jsPins,
    { [lock.parent.binary]: lock.parent.binarySha256 },
  ])
    for (const [f, h] of Object.entries(pins)) assert.equal(sha(read(f)), h, "pin_drift");
  assert.equal(lock.variants.length, 174);
  assert.equal(result.rows.length, 58);
  assert.equal(new Set(lock.variants.map((r) => `${r.id}:${r.rotation}`)).size, 174);
  const queries = lock.parent.rows.filter((r) =>
    ["product_query", "safety_audit"].includes(r.allocationRole),
  );
  let index = 538;
  const counters = { capabilities: 1, hashes: 369, encodes: 100, decodes: 68, processes: 538 };
  const take = (kind, digest) => {
    const i = index++,
      attempt = load(`${dir}/process-${i}-attempt.json`),
      receipt = load(`${dir}/process-${i}-result.json`);
    assert.equal(attempt.index, i);
    assert.equal(receipt.index, i);
    assert.equal(attempt.kind, kind);
    assert.equal(receipt.kind, kind);
    assert.equal(attempt.lockSha256, lockSha256);
    assert.equal(attempt.inputSha256, digest);
    assert.equal(
      attempt.command,
      {
        hashes: "--reference-hash-stdin",
        encodes: "--reference-encode-stdin",
        decodes: "--reference-rgb-stdin",
      }[kind],
    );
    assert.equal(receipt.status, 0);
    assert.equal(receipt.reason, null);
    assert.equal(receipt.signal, null);
    assert.equal(receipt.errorCode, null);
    for (const s of ["stdout", "stderr"]) {
      assert.equal(receipt[s].file, `${dir}/process-${i}.${s}`);
      const b = read(receipt[s].file, 4_300_000);
      assert.equal(sha(b), receipt[s].sha256);
      assert.equal(b.length, receipt[s].bytes);
    }
    assert.ok(receipt.stdout.bytes + receipt.stderr.bytes <= 4_300_000);
    counters[kind]++;
    counters.processes++;
    return JSON.parse(read(receipt.stdout.file));
  };
  const hashing = (h) => assert.equal(take("hashes", h), h);
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i],
      record = result.rows[i];
    assert.equal(q.id, record.id);
    assert.equal(q.productId, record.productId);
    assert.equal(q.allocationRole, record.allocationRole);
    assert.deepEqual(record.views[0], { rotation: 0, result: lock.result.rows[i].result });
    const variants = lock.variants.filter((v) => v.id === q.id);
    assert.deepEqual(
      variants.map((v) => v.rotation),
      [90, 180, 270],
    );
    for (let j = 0; j < variants.length; j++) {
      const v = variants[j],
        recordView = record.views[j + 1];
      assert.equal(v.originalImageSha256, q.imageSha256);
      const image = read(v.file, 1_500_000);
      assert.equal(image.length, v.bytes);
      assert.equal(sha(image), v.imageSha256);
      hashing(v.imageSha256);
      const vectorHash = checkNativeVector(
        take("encodes", v.imageSha256),
        lock.parent.manifest,
        v.imageSha256,
      );
      hashing(v.imageSha256);
      hashing(vectorHash);
      checkNativeRgb(take("decodes", v.imageSha256), v.imageSha256);
      hashing(v.imageSha256);
      assert.equal(recordView.rotation, v.rotation);
      const value = recordView.result;
      assert.ok(["candidate", "ambiguous", "unknown"].includes(value.status));
      assert.equal(value.queryImageSha256, v.imageSha256);
      assert.equal(value.vectorSha256, vectorHash);
      assert.equal(value.catalogueSha256, lock.parent.serializedManifestSha256);
      assert.equal(value.encoderSha256, lock.parent.manifest.encoderSha256);
      assert.equal(value.preprocessingSha256, lock.parent.manifest.preprocessingSha256);
      assert.equal(value.integrationAllowed, false);
      assert.equal(value.verificationStatus, "inferred");
      assert.equal(value.confidence, "uncalibrated_visual_similarity");
      const manifest = lock.parent.manifest;
      assert.ok(value.productIds.every((id) => manifest.products.some((p) => p.productId === id)));
      assert.deepEqual(
        value.sources,
        manifest.images
          .filter((r) => r.role === "reference" && value.productIds.includes(r.productId))
          .map((r) => r.source),
      );
      assert.deepEqual(load(`${dir}/view-${i}-${v.rotation}.json`), {
        id: q.id,
        originalImageSha256: q.imageSha256,
        ...v,
        result: value,
      });
    }
    assert.deepEqual(record.result, recountOrientation(record.views));
    assert.deepEqual(record, load(`${dir}/query-${i}.json`));
  }
  assert.equal(index, 1582);
  assert.deepEqual(counters, {
    capabilities: 1,
    hashes: 1065,
    encodes: 274,
    decodes: 242,
    processes: 1582,
  });
  assert.deepEqual(result.calls, counters);
  assert.equal(result.replayedOperations, 538);
  assert.equal(result.newOperations, 1044);
  const metrics = recountExpandedMetrics(
    result.rows,
    lock.parent.previousAgreements,
    lock.parent.pilots,
  );
  assert.deepEqual(metrics, result.metrics);
  assert.equal(result.status, metrics.qualityGatePassed ? "passed" : "quality_gate_failed");
  return {
    status: "verified",
    newProcessReceipts: 1044,
    cachedProcessPins: 538,
    sourcePins: Object.keys(lock.sources).length,
    inputPins: Object.keys(lock.inputPins).length,
    derivedInputs: 174,
    decisions: 58,
    metrics,
    newModelCalls: 0,
    physicalDeviceEvidence: false,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 6);
  process.stdout.write(`${JSON.stringify(reviewOrientationCorpus(...process.argv.slice(2)))}\n`);
}
