// Separate accounting/diagnostic implementation: only Node, no recognizer imports.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkNativeRgb, checkNativeVector } from "./review-native-corpus.mjs";
const rootDefault = fileURLToPath(new URL("../../", import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
export function recountExpandedMetrics(rows, prior, pilots) {
  assert.equal(rows.length, 58);
  assert.equal(new Set(rows.map((r) => r.id)).size, 58);
  const products = rows.filter((r) => r.allocationRole === "product_query"),
    audits = rows.filter((r) => r.allocationRole === "safety_audit");
  assert.equal(products.length, 17);
  assert.equal(audits.length, 41);
  assert.equal(pilots.length, 5);
  const correct = (r) =>
    r.result?.status === "candidate" &&
    Array.isArray(r.result.productIds) &&
    r.result.productIds.length === 1 &&
    r.result.productIds[0] === r.productId;
  const right = products.filter(correct),
    wrong = products.filter((r) => r.result?.status === "candidate" && !correct(r)),
    lost = prior.filter((id) => !right.some((r) => r.id === id)),
    missed = pilots.filter(
      (p) => !right.some((r) => r.id === p.pilotQuery && r.productId === p.productId),
    ),
    unsafe = audits.filter((r) => r.result?.status !== "unknown"),
    failures = rows.filter(
      (r) => !["unknown", "ambiguous", "candidate"].includes(r.result?.status),
    );
  return {
    planned: 58,
    productQueries: 17,
    safetyAudits: 41,
    sourceAgreements: right.length,
    sourceDisagreements: wrong.length,
    ambiguous: products.filter((r) => r.result?.status === "ambiguous").length,
    unknown: products.filter((r) => r.result?.status === "unknown").length,
    perProduct: pilots.map((p) => ({
      productId: p.productId,
      planned: products.filter((r) => r.productId === p.productId).length,
      agreements: right.filter((r) => r.productId === p.productId).length,
      pilotAgrees: !missed.includes(p),
    })),
    agreementIds: right.map((r) => r.id),
    disagreementIds: wrong.map((r) => r.id),
    priorAgreementLosses: lost,
    missingPilotIds: missed.map((p) => p.pilotQuery),
    safetyNonUnknowns: unsafe.map((r) => ({
      id: r.id,
      status: r.result?.status ?? "not_attempted",
    })),
    failures: failures.map((r) => r.id),
    qualityGatePassed:
      right.length >= 14 &&
      !wrong.length &&
      !lost.length &&
      !missed.length &&
      !unsafe.length &&
      !failures.length,
    independentAccuracyEstablished: false,
    integrationAllowed: false,
  };
}
export function reviewExpandedCorpus(
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
    assert.ok(
      /\.(?:mjs|ts|swift|json|yaml|md|txt|stdout|stderr|bin|mil|mpsgraph|coremldata|params|model|mlmodel|plist|jpe?g|png)$/u.test(
        f,
      ) || f.endsWith("/vision-cli"),
    );
    const target = path.join(root, f);
    assert.equal(fs.realpathSync(target), target);
    const before = fs.lstatSync(target, { bigint: true });
    assert.ok(
      before.isFile() &&
        !before.isSymbolicLink() &&
        before.nlink === 1n &&
        before.size <= BigInt(maximum),
    );
    const b = fs.readFileSync(target),
      after = fs.lstatSync(target, { bigint: true });
    for (const k of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) assert.equal(after[k], before[k]);
    assert.equal(BigInt(b.length), before.size);
    return b;
  };
  const load = (f) => JSON.parse(read(f));
  assert.equal(sha(read(lockFile)), lockSha256);
  assert.equal(sha(read(summaryFile)), summarySha256);
  const lock = load(lockFile),
    result = load(summaryFile),
    dir = path.posix.dirname(summaryFile);
  assert.equal(lock.schemaVersion, "expanded-corpus-lock-v2");
  assert.equal(result.schemaVersion, "expanded-corpus-result-v2");
  assert.equal(result.lockSha256, lockSha256);
  assert.equal(result.failure, null);
  for (const group of [
    lock.sources,
    lock.inputPins,
    lock.resourcePins,
    lock.jsPins,
    lock.continuation.pins,
    { [lock.binary]: lock.binarySha256 },
  ])
    for (const [f, h] of Object.entries(group)) assert.equal(sha(read(f)), h, "pin_mismatch");
  const manifest = lock.manifest,
    catalogue = sha(JSON.stringify(manifest));
  assert.equal(catalogue, lock.serializedManifestSha256);
  assert.equal(result.compilation.catalogueSha256, catalogue);
  assert.equal(result.compilation.referenceCount, 10);
  assert.equal(result.compilation.calibrationCount, 32);
  const fit = lock.rows.filter((r) =>
      ["reference", "calibration_negative"].includes(r.allocationRole),
    ),
    queries = lock.rows.filter((r) => ["product_query", "safety_audit"].includes(r.allocationRole));
  assert.equal(fit.length, 42);
  assert.equal(queries.length, 58);
  const fitFamilies = new Set(fit.map((r) => r.familyId));
  assert.ok(queries.every((r) => !fitFamilies.has(r.familyId)));
  let index = 0;
  const counters = { capabilities: 0, hashes: 0, encodes: 0, decodes: 0, processes: 0 },
    vectors = new Map();
  const take = (kind, inputSha256) => {
    const i = index++,
      prefix = i < 274,
      directory = prefix ? lock.continuation.directory : dir;
    const a = load(`${directory}/process-${i}-attempt.json`),
      r = load(`${directory}/process-${i}-result.json`);
    assert.equal(a.index, i);
    assert.equal(r.index, i);
    assert.equal(a.kind, kind);
    assert.equal(r.kind, kind);
    assert.equal(a.lockSha256, prefix ? lock.continuation.parentSha256 : lockSha256);
    assert.equal(a.inputSha256, inputSha256);
    assert.equal(
      a.command,
      {
        capabilities: "--reference-capabilities",
        hashes: "--reference-hash-stdin",
        encodes: "--reference-encode-stdin",
        decodes: "--reference-rgb-stdin",
      }[kind],
    );
    assert.equal(r.status, 0);
    assert.equal(r.reason, null);
    assert.equal(r.signal, null);
    assert.equal(r.errorCode, null);
    for (const stream of ["stdout", "stderr"]) {
      assert.equal(r[stream].file, `${directory}/process-${i}.${stream}`);
      const b = read(r[stream].file, 4_300_000);
      assert.equal(sha(b), r[stream].sha256);
      assert.equal(b.length, r[stream].bytes);
    }
    assert.ok(r.stdout.bytes + r.stderr.bytes <= 4_300_000);
    counters[kind]++;
    counters.processes++;
    return JSON.parse(read(r.stdout.file));
  };
  const c = take("capabilities", sha(Buffer.alloc(0)));
  assert.equal(c.encoderSha256, manifest.encoderSha256);
  assert.equal(c.preprocessingSha256, manifest.preprocessingSha256);
  assert.equal(c.integrationAllowed, false);
  const hash = (h) => assert.equal(take("hashes", h), h);
  hash(catalogue);
  const consume = (row, rgb) => {
    hash(row.imageSha256);
    const v = take("encodes", row.imageSha256),
      h = checkNativeVector(v, manifest, row.imageSha256);
    vectors.set(row.id, v.vector);
    hash(row.imageSha256);
    hash(h);
    if (rgb) {
      checkNativeRgb(take("decodes", row.imageSha256), row.imageSha256);
      hash(row.imageSha256);
    }
    return h;
  };
  for (const row of fit) consume(row, row.allocationRole === "reference");
  for (let i = 0; i < queries.length; i++) {
    const row = queries[i],
      vh = consume(row, true),
      record = result.rows[i],
      v = record.result;
    assert.equal(row.id, record.id);
    assert.equal(row.productId, record.productId);
    assert.equal(row.allocationRole, record.allocationRole);
    assert.equal(row.imageSha256, record.imageSha256);
    assert.deepEqual(record, load(`${dir}/query-${i}.json`));
    if (i < 13) assert.deepEqual(record, load(`${lock.continuation.directory}/query-${i}.json`));
    assert.equal(v.vectorSha256, vh);
    assert.equal(v.queryImageSha256, row.imageSha256);
    assert.equal(v.catalogueSha256, catalogue);
    assert.equal(v.encoderSha256, manifest.encoderSha256);
    assert.equal(v.preprocessingSha256, manifest.preprocessingSha256);
    assert.equal(v.integrationAllowed, false);
    assert.equal(v.verificationStatus, "inferred");
    assert.equal(v.confidence, "uncalibrated_visual_similarity");
    assert.ok(v.productIds.every((id) => manifest.products.some((p) => p.productId === id)));
    if (v.status === "unknown") assert.deepEqual(v.productIds, []);
    assert.deepEqual(
      v.products,
      manifest.products
        .filter((p) => v.productIds.includes(p.productId))
        .map((p) => ({ ...p, sourceStatus: "source_asserted_pending_review" })),
    );
    assert.deepEqual(
      v.sources,
      manifest.images
        .filter((r) => r.role === "reference" && v.productIds.includes(r.productId))
        .map((r) => r.source),
    );
  }
  assert.deepEqual(counters, {
    capabilities: 1,
    hashes: 369,
    encodes: 100,
    decodes: 68,
    processes: 538,
  });
  assert.deepEqual(result.calls, counters);
  assert.equal(result.replayedNativeOperations, 274);
  assert.equal(result.newNativeOperations, 264);
  const metrics = recountExpandedMetrics(result.rows, lock.previousAgreements, lock.pilots);
  assert.deepEqual(result.metrics, metrics);
  assert.equal(result.status, metrics.qualityGatePassed ? "passed" : "quality_gate_failed");
  const dot = (a, b) => a.reduce((n, x, i) => n + x * b[i], 0);
  const diagnostics = lock.pilots.map((p) => {
    const q = vectors.get(p.pilotQuery),
      refs = fit.filter((r) => r.productId === p.productId),
      negatives = fit.filter((r) => r.allocationRole === "calibration_negative");
    const galleryMinimum = dot(vectors.get(refs[0].id), vectors.get(refs[1].id)),
      maximumNegative = Math.max(
        ...refs.flatMap((r) => negatives.map((n) => dot(vectors.get(r.id), vectors.get(n.id)))),
      );
    return {
      id: p.pilotQuery,
      productId: p.productId,
      referenceCosines: refs.map((r) => dot(q, vectors.get(r.id))),
      galleryMinimum,
      maximumNegative,
      derivedMinimum: Math.max(
        0.75,
        (galleryMinimum + maximumNegative) / 2,
        maximumNegative + 0.05,
      ),
    };
  });
  return {
    status: "verified",
    sourcePins: Object.keys(lock.sources).length,
    dataPins: Object.keys(lock.inputPins).length,
    resourcePins: Object.keys(lock.resourcePins).length,
    processReceipts: index,
    replayed: 274,
    newlyExecuted: 264,
    metrics,
    diagnostics,
    newModelCalls: 0,
    physicalDeviceEvidence: false,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 6);
  process.stdout.write(`${JSON.stringify(reviewExpandedCorpus(...process.argv.slice(2)))}\n`);
}
