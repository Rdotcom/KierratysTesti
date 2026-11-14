// Existing source-labelled bytes only. No predictions, decode, fit or download.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { checkedWorkFile, readBounded } from "../local-vision/embedding-control.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const NATIVE_CORPUS_PRIOR_PINS = Object.freeze({
  "work/calibrated-v4-2026-11-13.o6ecTQ/freeze/lock.json":
    "1610696e449965b39cf1db1f0c25e53b2f69ee4c00d42b099b4ac42d97c4ea1f",
  "work/calibrated-v4-2026-11-13.o6ecTQ/result/summary.json":
    "17afd7060475a3800a41c1e0580d6ee29b8bf0abcc961e4b5c4b67edbca57765",
});
const v4 = Object.keys(NATIVE_CORPUS_PRIOR_PINS);
const offPath = "work/off-hybrid-2026-11-13.AL8bSt/freeze/lock.json";
const acquisitionPath = "work/off-release-2026-11-13.MnzfCI/recovered/acquisition.json";
const oldPath = "work/two-view-learning-2026-11-09.d0J4kb/freeze/lock.json";
const counts = Object.freeze({
  reference: 8,
  calibration_only: 40,
  product: 12,
  evaluation_negative: 24,
  unresolved_identity: 8,
  insufficient_gallery: 1,
});
export const NATIVE_CORPUS_COUNTS = counts;

/** Pure metadata check used before any image call. No role inferred from output. */
export function validateNativeCorpusAllocation(rows) {
  assert.ok(Array.isArray(rows) && rows.length === 93, "corpus_count");
  assert.equal(new Set(rows.map((r) => r.id)).size, 93, "duplicate_id");
  assert.equal(new Set(rows.map((r) => r.imageSha256)).size, 93, "duplicate_image");
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(counts).map((role) => [role, rows.filter((r) => r.role === role).length]),
    ),
    counts,
    "role_counts",
  );
  const gallery = rows.filter((r) => r.role === "reference"),
    products = [...new Set(gallery.map((r) => r.productId))];
  assert.equal(products.length, 4, "catalogue_product_count");
  assert.ok(
    products.every((id) => gallery.filter((r) => r.productId === id).length === 2),
    "two_refs_per_product",
  );
  const trainFamilies = new Set(rows.filter((r) => r.split === "train").map((r) => r.sourceFamily));
  for (const row of rows) {
    assert.match(row.id, /^[a-z0-9][a-z0-9._-]{0,63}$/u);
    assert.match(row.imageSha256, /^[a-f0-9]{64}$/u);
    assert.ok(
      typeof row.file === "string" &&
        row.file.startsWith("work/") &&
        !row.file.split("/").includes(".."),
      "image_path",
    );
    assert.equal(row.source.reviewStatus, "source_asserted_pending_review", "not_verified");
    assert.ok(
      typeof row.source.licence === "string" && row.source.licence.length > 0,
      "licence_missing",
    );
    assert.ok(
      typeof row.sourceFamily === "string" && row.sourceFamily.length > 0,
      "family_missing",
    );
    if (row.split === "validation")
      assert.ok(!trainFamilies.has(row.sourceFamily), "family_leakage");
    if (row.role === "calibration_only") assert.equal(row.split, "train", "fit_leakage");
    if (row.role === "evaluation_negative")
      assert.equal(row.split, "validation", "evaluation_split");
    if (["reference", "product"].includes(row.role))
      assert.ok(products.includes(row.productId), "unknown_product");
    if (row.role === "insufficient_gallery")
      assert.ok(!products.includes(row.productId), "sentinel_enrolled");
  }
  return {
    counts,
    enrolledProductIds: products,
    evaluationQueries: 45,
    totalBytes: rows.reduce((n, r) => n + r.bytes, 0),
  };
}

export function loadNativeCorpus(root) {
  const files = {},
    read = (file, digest, maximum = 4_000_000) => {
      assert.match(digest ?? "", /^[a-f0-9]{64}$/u, "missing_trust_pin");
      const bytes = readBounded(checkedWorkFile(file, root), maximum);
      assert.equal(sha(bytes), digest, "input_drift");
      files[file] = digest;
      return bytes;
    };
  const lock = JSON.parse(read(v4[0], NATIVE_CORPUS_PRIOR_PINS[v4[0]]));
  const baseline = JSON.parse(read(v4[1], NATIVE_CORPUS_PRIOR_PINS[v4[1]]));
  assert.equal(baseline.lockSha256, NATIVE_CORPUS_PRIOR_PINS[v4[0]]);
  const pinnedJson = (file) => JSON.parse(read(file, lock.inputPins[file]));
  const off = pinnedJson(offPath),
    acquisition = pinnedJson(acquisitionPath),
    old = pinnedJson(oldPath);
  assert.equal(acquisition.integrationAllowed, false);
  const rows = off.images.map((row) => {
    const record = acquisition.observations.find((r) => r.blindId === row.blindId);
    assert.ok(
      record && record.status === "ready" && record.productId === row.productId,
      "acquisition_join",
    );
    assert.equal(record.originalSha256, row.imageSha256);
    const bytes = read(row.file, row.imageSha256, 1_500_000);
    return {
      id: row.blindId,
      role:
        row.role === "gallery_self"
          ? "reference"
          : row.role === "cross_upload"
            ? "product"
            : "insufficient_gallery",
      productId: row.productId,
      label: `${record.sourceReportedName} ${record.sourceReportedQuantity}`,
      file: row.file,
      imageSha256: row.imageSha256,
      bytes: bytes.length,
      sourceFamily: record.sourceFamilyId,
      split: "source_upload_unverified_independence",
      source: {
        publisher: `Open Food Facts / ${record.authorCredit}`,
        url: record.imageUrl,
        licence: "CC-BY-SA-3.0 images; ODbL/DbCL product metadata",
        checkedOn: acquisition.acquiredAt.slice(0, 10),
        snapshotSha256: lock.inputPins[acquisitionPath],
        reviewStatus: "source_asserted_pending_review",
      },
      sourceMetadata: record,
    };
  });
  for (const m of old.basisProof.linearProof.manifests) {
    const bytes = read(m.path, m.sha256),
      json = JSON.parse(bytes);
    for (const fixture of json.fixtures) {
      const control = lock.controlPlan.find((r) => r.id === fixture.sha256);
      assert.ok(
        control && control.sourceId === fixture.id && control.sourceFamily === fixture.sourceFamily,
        "control_join",
      );
      assert.match(fixture.id, /^[a-z0-9-]+$/u);
      assert.equal(fixture.privacyReview, "no_identifiable_person_or_private_text_observed");
      const file = path.posix.join(path.posix.dirname(m.path), `${fixture.id}.jpg`);
      const image = read(file, fixture.sha256, 1_500_000);
      rows.push({
        id: control.id,
        role: control.role,
        split: control.split,
        sourceFamily: control.sourceFamily,
        controlKind: control.controlKind,
        file,
        imageSha256: fixture.sha256,
        bytes: image.length,
        source: {
          publisher: `Wikimedia Commons / ${fixture.author}`,
          url: fixture.pageUrl,
          licence: fixture.license,
          checkedOn: "2026-11-07",
          snapshotSha256: m.sha256,
          reviewStatus: "source_asserted_pending_review",
        },
        sourceMetadata: fixture,
      });
    }
  }
  const allocation = validateNativeCorpusAllocation(rows);
  assert.equal(baseline.rows.length, 44);
  const previousAgreements = baseline.rows
    .filter(
      (r) =>
        r.role === "product" &&
        r.calibrated.status === "candidate" &&
        r.calibrated.productId === r.productId,
    )
    .map((r) => r.id);
  assert.equal(previousAgreements.length, 7);
  const training = rows.filter((r) => ["reference", "calibration_only"].includes(r.role));
  assert.ok(training.reduce((n, r) => n + r.bytes, 0) <= 32 * 1024 * 1024, "runtime_gallery_size");
  return { rows, files, allocation, previousAgreements };
}

export function summarizeNativeCorpus(rows, previousAgreements) {
  assert.equal(rows.length, 45, "all_query_denominators_required");
  assert.equal(new Set(rows.map((r) => r.id)).size, 45, "duplicate_query");
  const products = rows.filter((r) => r.role === "product"),
    controls = rows.filter((r) => r.role !== "product");
  assert.equal(products.length, 12);
  const agrees = (r) =>
    r.result?.status === "candidate" &&
    r.result.productIds.length === 1 &&
    r.result.productIds[0] === r.productId;
  const agreements = products.filter(agrees),
    disagreements = products.filter((r) => r.result?.status === "candidate" && !agrees(r));
  const losses = previousAgreements.filter((id) => !products.some((r) => r.id === id && agrees(r)));
  const failures = rows.filter(
    (r) => !["candidate", "ambiguous", "unknown"].includes(r.result?.status),
  );
  const controlNonUnknowns = controls.filter((r) => r.result?.status !== "unknown");
  return {
    planned: 45,
    productQueries: 12,
    sourceAgreements: agreements.length,
    sourceDisagreements: disagreements.length,
    ambiguous: products.filter((r) => r.result?.status === "ambiguous").length,
    unknown: products.filter((r) => r.result?.status === "unknown").length,
    agreementProducts: [...new Set(agreements.map((r) => r.productId))],
    priorAgreementLosses: losses,
    disagreementIds: disagreements.map((r) => r.id),
    controlNonUnknowns: controlNonUnknowns.map((r) => ({
      id: r.id,
      role: r.role,
      status: r.result?.status ?? "not_attempted",
    })),
    failures: failures.map((r) => r.id),
    engineeringParityPassed:
      agreements.length >= 7 &&
      !disagreements.length &&
      !losses.length &&
      !controlNonUnknowns.length &&
      !failures.length,
    independentAccuracyEstablished: false,
    integrationAllowed: false,
  };
}
