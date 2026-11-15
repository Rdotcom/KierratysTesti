// Built-ins-only independent receipt/arithmetic review; never executes a model.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const hash = (b) => createHash("sha256").update(b).digest("hex");
export function wilson95(successes, total) {
  if (!total) return null;
  const z = 1.959963984540054,
    p = successes / total,
    d = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / d;
  const radius = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / d;
  return [Math.max(0, centre - radius), Math.min(1, centre + radius)];
}
export function summarizeOfflineResults(observations) {
  const known = observations.filter((x) => x.role === "product_query"),
    audits = observations.filter((x) => x.role === "safety_audit");
  const suggestions = known.filter((x) => x.resolved?.result.status === "confirmation_required");
  const agreements = suggestions.filter(
    (x) =>
      x.resolved.result.products.length === 1 &&
      x.resolved.result.products[0].id === x.expectedSourceProductId,
  ).length;
  const noIdentity = (x) =>
    ["unknown", "product_not_in_catalogue", "invalid_barcode", "ambiguous_barcode"].includes(
      x.resolved?.result.status,
    );
  const top1 = known.filter(
    (x) =>
      typeof x.expectedSourceProductId === "string" &&
      x.resolved?.ranking?.[0]?.productId === x.expectedSourceProductId,
  ).length;
  const times = observations
    .filter((x) => !x.failure)
    .map((x) => x.resolved.durationMs)
    .sort((a, b) => a - b);
  const percentile = (p) => times[Math.max(0, Math.ceil(times.length * p) - 1)] ?? null;
  return {
    known: known.length,
    audits: audits.length,
    generatedFixtures: observations.filter((x) => x.role === "generated_barcode").length,
    top1,
    top1Rate: top1 / known.length,
    top1DescriptiveWilson95: wilson95(top1, known.length),
    recall5: known.filter((x) =>
      x.resolved?.ranking?.some((r) => r.productId === x.expectedSourceProductId),
    ).length,
    confirmationSuggestions: suggestions.length,
    suggestionSourceAgreements: agreements,
    suggestionSourceDisagreements: suggestions.length - agreements,
    suggestionAgreementDescriptiveWilson95: wilson95(agreements, suggestions.length),
    knownBarcodeMatches: known.filter((x) => x.resolved?.result.status === "catalogue_match")
      .length,
    automaticVisualAccepts: 0,
    automaticVisualPrecision: null,
    automaticVisualCoverage: 0,
    knownNoAutomaticIdentity: known.filter((x) => x.resolved?.result.status !== "catalogue_match")
      .length,
    safetyNoIdentity: audits.filter(noIdentity).length,
    safetySuggestions: audits.filter((x) => x.resolved?.result.status === "confirmation_required")
      .length,
    safetyBarcodeMatches: audits.filter((x) => x.resolved?.result.status === "catalogue_match")
      .length,
    safetyNoIdentityDescriptiveWilson95: wilson95(audits.filter(noIdentity).length, audits.length),
    failures: observations.filter((x) => x.failure).length,
    failureIds: observations.filter((x) => x.failure).map((x) => x.id),
    successfulNativeLatencyMs: {
      n: times.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: percentile(1),
    },
    maximumChildRssBytes: Math.max(...observations.map((x) => x.peakRssBytes ?? 0)),
    populationConfidenceEstablished: false,
    publicReleaseGate: "FAIL",
    confidenceIntervalCaveat: "descriptive_binomial_only_capture_independence_not_established",
  };
}
export function reviewOfflineProduct(directory) {
  const base = path.resolve(root, directory);
  assert.ok(base.startsWith(`${root}work/`) && fs.realpathSync(base) === base);
  const read = (file, maximum = 8000000) => {
    const full = path.resolve(root, file),
      s = fs.lstatSync(full);
    assert.ok(
      full.startsWith(root) &&
        !s.isSymbolicLink() &&
        s.isFile() &&
        s.nlink === 1 &&
        s.size <= maximum &&
        fs.realpathSync(full) === full,
    );
    assert.ok(!/(?:^|\/)\.env(?:\.|$)|\.pem$|\.key$/u.test(file));
    return fs.readFileSync(full);
  };
  const lockBytes = read(path.join(base, "lock.json")),
    lock = JSON.parse(lockBytes);
  const ledger = JSON.parse(read("work/offline-product-integration-v1-attempt.json"));
  assert.equal(ledger.lockSha256, hash(lockBytes));
  assert.equal(path.resolve(root, ledger.output), base);
  for (const [f, h] of Object.entries(lock.pins)) assert.equal(hash(read(f)), h);
  for (const [f, h] of Object.entries(lock.resourcePins)) assert.equal(hash(read(f, 24000000)), h);
  assert.equal(hash(read(path.join(base, "../vision-cli"))), lock.binarySha256);
  assert.equal(hash(read(path.join(base, "js/runtime.mjs"))), lock.jsSha256);
  assert.equal(hash(read(path.join(base, "js/catalogue.mjs"))), lock.catalogueJsSha256);
  const original = read(path.join(base, "../catalogue/catalogue.json"));
  assert.equal(hash(original), lock.catalogueSha256);
  const catalogue = JSON.parse(original);
  assert.deepEqual(catalogue, JSON.parse(read("mobile/app/assets/offline-product-catalogue.json")));
  const report = JSON.parse(read(path.join(base, "results.json")));
  assert.equal(report.observations.length, 60);
  assert.equal(lock.queries.length, 60);
  assert.equal(new Set(lock.queries.map((q) => q.id)).size, 60);
  for (let i = 0; i < lock.queries.length; i++) {
    const q = lock.queries[i],
      row = report.observations[i],
      receipt = JSON.parse(read(path.join(base, `${q.id}-native.json`)));
    assert.equal(q.id, row.id);
    assert.equal(receipt.id, row.id);
    assert.equal(hash(read(q.file)), q.imageSha256);
    assert.equal(receipt.imageSha256, q.imageSha256);
    assert.equal(row.role, q.allocationRole);
    assert.equal(row.expectedSourceProductId, q.productId ?? null);
    const raw = JSON.parse(receipt.stdout);
    if (row.failure) {
      assert.equal(row.resolved, null);
      assert.notEqual(receipt.status, 0);
      continue;
    }
    assert.equal(receipt.status, 0);
    assert.equal(raw.imageSha256, q.imageSha256);
    assert.equal(row.resolved.imageSha256, raw.imageSha256);
    assert.equal(row.resolved.durationMs, raw.durationMs);
    if (raw.embedding.status === "observed") {
      assert.equal(raw.embedding.encoderSha256, catalogue.encoderSha256);
      assert.equal(raw.embedding.preprocessingSha256, catalogue.preprocessingSha256);
      const scores = new Map();
      for (const reference of catalogue.references) {
        const dot = reference.vector.reduce((sum, n, j) => sum + n * raw.embedding.vector[j], 0);
        scores.set(
          reference.productId,
          Math.max(scores.get(reference.productId) ?? -Infinity, dot),
        );
      }
      const ranking = [...scores]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([productId, cosine]) => ({ productId, cosine }));
      assert.deepEqual(row.resolved.ranking, ranking);
    }
  }
  const generated = report.observations.filter((r) => r.role === "generated_barcode");
  assert.equal(generated[0].resolved.result.product.id, "off-3017620422003");
  assert.equal(generated[1].resolved.result.status, "product_not_in_catalogue");
  assert.equal(generated[1].resolved.result.gtin, "1234567890128");
  const probe = JSON.parse(read(path.join(base, "network-probe.json")));
  assert.notEqual(probe.status, 0);
  assert.match(
    probe.stderr,
    /not permitted|Could not resolve|Failed to connect|Couldn't connect/iu,
  );
  return {
    sourcePins: Object.keys(lock.pins).length,
    resourcePins: Object.keys(lock.resourcePins).length,
    queryReceipts: report.observations.length,
    formattedCatalogueSha256: hash(read("mobile/app/assets/offline-product-catalogue.json")),
    metrics: summarizeOfflineResults(report.observations),
    newModelCalls: 0,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(reviewOfflineProduct(process.argv[2]), null, 2));
