// Source-assigned cross-upload DEVELOPMENT only. No independent ground truth,
// downloads, catalogue acceptance, production integration or parameter search.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "tsup";
import {
  checkedOutput,
  checkedWorkFile,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import { parseSelection, OFF_ACQUISITION_POLICY } from "./acquire-off-references.mjs";
import { createNodeReferencePorts, NODE_REFERENCE_DECODE_POLICY } from "./node-runtime-ports.mjs";
import { loadPinnedReferenceDecoder } from "./pinned-reference-decoder.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/u;
const selectionFile = "scripts/qa/reference-image/off-initial-selection.json";
const selectionSha256 = "904d38041e528dfaff897ebcef3f8bd5436411a7b1d138cd561bb9d397170ef8";
const ledger = "work/off-reference-development-v1-attempt.json";
export const OFF_DEVELOPMENT_POLICY = Object.freeze({
  id: "off-cross-upload-development-v1",
  enrollmentUploadsPerProduct: 2,
  maximumUploads: 21,
  maximumProducts: 5,
  maximumDecodes: 21,
  maximumExtractions: 21,
  maximumMatches: 21,
  gallerySelection: "first-two-numeric-original-id-ready-privacy-allowed-before-features",
  featureSerialization: "development-json-extraction-result-v1",
  humanAccepted: false,
  integrationAllowed: false,
  releaseAccepted: false,
  independentAccuracyEstablished: false,
});
function boundedJson(serialized, maximum = 2_000_000) {
  assert.ok(
    typeof serialized === "string" &&
      Buffer.byteLength(serialized) > 0 &&
      Buffer.byteLength(serialized) <= maximum,
    "json_bound",
  );
  return JSON.parse(serialized);
}
function selected(cwd) {
  const bytes = readBounded(path.join(cwd, selectionFile), 65_536);
  assert.equal(hash(bytes), selectionSha256, "selection_drift");
  return parseSelection(bytes.toString("utf8"));
}
/** Pure metadata joins only; no image/file/decoder access or review upgrade. */
export function parseDevelopmentInputs(
  acquisitionSerialized,
  acquisitionSha256,
  privacySerialized,
  expectedEntries,
) {
  assert.match(acquisitionSha256, hashPattern, "acquisition_pin");
  assert.ok(
    typeof acquisitionSerialized === "string" &&
      Buffer.byteLength(acquisitionSerialized) <= 2_000_000,
    "acquisition_bound",
  );
  assert.equal(hash(acquisitionSerialized), acquisitionSha256, "acquisition_hash");
  const acquisition = boundedJson(acquisitionSerialized),
    privacy = boundedJson(privacySerialized, 65_536);
  assert.ok(
    [OFF_ACQUISITION_POLICY.version, "off-reference-recovery-v1"].includes(acquisition.version) &&
      acquisition.selectionSha256 === selectionSha256 &&
      hashPattern.test(acquisition.lockSha256),
    "acquisition_version",
  );
  assert.ok(
    acquisition.integrationAllowed === false &&
      acquisition.humanAccepted === false &&
      acquisition.captureIndependence === "unverified" &&
      acquisition.split === "unassigned",
    "unaccepted_acquisition_required",
  );
  assert.ok(
    Array.isArray(acquisition.observations) &&
      acquisition.observations.length === 21 &&
      Array.isArray(expectedEntries) &&
      expectedEntries.length === 21,
    "exact_upload_count",
  );
  const expected = new Map(expectedEntries.map((entry) => [entry.blindId, entry]));
  assert.equal(expected.size, 21, "duplicate_selected_upload");
  const seen = new Set();
  for (const row of acquisition.observations) {
    const source = expected.get(row.blindId);
    assert.ok(source && !seen.has(row.blindId), "unexpected_or_duplicate_upload");
    seen.add(row.blindId);
    for (const [key, value] of Object.entries(source))
      assert.deepEqual(row[key], value, "source_assignment_drift");
    assert.ok(["ready", "failed", "not_attempted"].includes(row.status), "acquisition_status");
    if (row.originalSha256 !== undefined)
      assert.ok(
        hashPattern.test(row.originalSha256) &&
          row.originalFile === `originals/${row.blindId}.jpg` &&
          Number.isSafeInteger(row.originalBytes) &&
          row.originalBytes > 0 &&
          row.originalBytes <= OFF_ACQUISITION_POLICY.maximumImageBytes,
        "original_binding",
      );
    else
      assert.ok(
        row.originalFile === undefined && row.originalBytes === undefined,
        "partial_original_binding",
      );
    if (row.status === "ready")
      assert.ok(
        row.originalSha256 &&
          hashPattern.test(row.reviewImageSha256) &&
          row.reviewFile === `blind/images/${row.blindId}.png` &&
          row.reviewTransform === OFF_ACQUISITION_POLICY.reviewTransform &&
          [row.width, row.height].every((n) => Number.isInteger(n) && n >= 32 && n <= 1024),
        "review_binding",
      );
    else
      assert.ok(
        row.reviewImageSha256 === undefined &&
          row.reviewFile === undefined &&
          typeof row.reason === "string",
        "unavailable_review_binding",
      );
  }
  const counters = acquisition.counters;
  assert.ok(counters && counters.planned === 21, "acquisition_counters");
  for (const key of [
    "requests",
    "downloaded",
    "decodes",
    "reviewEncodes",
    "ready",
    "failed",
    "notAttempted",
    "featureExtractions",
    "matcherCalls",
    "trainingCalls",
    "paidRequests",
  ])
    assert.ok(
      Number.isSafeInteger(counters[key]) &&
        counters[key] >= 0 &&
        counters[key] <= (key === "requests" ? 23 : 21),
      "acquisition_counter_bound",
    );
  assert.equal(
    counters.ready,
    acquisition.observations.filter((row) => row.status === "ready").length,
    "ready_counter_mismatch",
  );
  assert.equal(
    counters.failed,
    acquisition.observations.filter((row) => row.status === "failed").length,
    "failed_counter_mismatch",
  );
  assert.equal(
    counters.notAttempted,
    acquisition.observations.filter((row) => row.status === "not_attempted").length,
    "not_attempted_counter_mismatch",
  );
  assert.ok(
    counters.downloaded <= counters.requests &&
      counters.decodes === counters.downloaded &&
      counters.reviewEncodes <= counters.decodes &&
      counters.ready <= counters.reviewEncodes,
    "acquisition_counter_order",
  );
  if (acquisition.version === OFF_ACQUISITION_POLICY.version)
    assert.equal(counters.requests, 21 - counters.notAttempted, "acquisition_request_count");
  else {
    const base = acquisition.baseAcquisition,
      recovery = acquisition.recovery;
    assert.ok(
      base && hashPattern.test(base.manifestSha256) && hashPattern.test(base.lockSha256),
      "base_acquisition_binding",
    );
    assert.ok(
      recovery &&
        hashPattern.test(recovery.lockSha256) &&
        recovery.lockSha256 === acquisition.lockSha256 &&
        hashPattern.test(acquisition.diagnosticSha256),
      "recovery_binding",
    );
    assert.deepEqual(recovery.plannedBlindIds, ["case-008", "case-013"], "exact_recovery_cases");
    assert.ok(
      base.counters &&
        base.counters.planned === 21 &&
        base.counters.requests === 21 &&
        base.counters.ready === 19 &&
        base.counters.failed === 2 &&
        base.counters.notAttempted === 0,
      "preserved_base_attempts",
    );
    assert.ok(
      recovery.counters &&
        recovery.counters.planned === 2 &&
        Number.isSafeInteger(recovery.counters.requests) &&
        recovery.counters.requests >= 0 &&
        recovery.counters.requests <= 2,
      "recovery_request_bound",
    );
    for (const name of ["requests", "downloaded", "decodes", "reviewEncodes"])
      assert.equal(
        counters[name],
        base.counters[name] + recovery.counters[name],
        "base_plus_recovery_counter_join",
      );
    assert.equal(
      counters.failedAttempts,
      base.counters.failed + recovery.counters.failed,
      "retained_failure_attempts",
    );
    assert.ok(
      counters.copiedOriginals === 19 && counters.copiedReviewImages === 19,
      "retained_base_copies",
    );
    for (const row of acquisition.observations.filter((row) =>
      ["case-008", "case-013"].includes(row.blindId),
    ))
      assert.deepEqual(
        row.baseAttempt,
        { status: "failed", reason: "response_type", bytesReceived: 0 },
        "recovered_failure_retained",
      );
  }
  for (const name of ["featureExtractions", "matcherCalls", "trainingCalls", "paidRequests"])
    assert.equal(counters[name], 0, "acquisition_is_not_evaluation");
  assert.ok(
    privacy.schemaVersion === "off-development-privacy-screen-v1" &&
      privacy.acquisitionSha256 === acquisitionSha256 &&
      privacy.humanAccepted === false &&
      privacy.integrationAllowed === false,
    "privacy_scope",
  );
  assert.ok(Array.isArray(privacy.rows) && privacy.rows.length === 21, "privacy_row_count");
  const screened = new Map();
  for (const row of privacy.rows) {
    const original = acquisition.observations.find((item) => item.blindId === row.blindId);
    assert.ok(original && !screened.has(row.blindId), "privacy_join");
    assert.ok(
      Object.keys(row).length === 3 &&
        Object.hasOwn(row, "blindId") &&
        Object.hasOwn(row, "reviewImageSha256") &&
        Object.hasOwn(row, "decision"),
      "privacy_fields",
    );
    if (original.status === "ready")
      assert.ok(
        row.reviewImageSha256 === original.reviewImageSha256 &&
          ["allow_development", "exclude_privacy"].includes(row.decision),
        "privacy_ready_binding",
      );
    else
      assert.ok(
        row.reviewImageSha256 === null && row.decision === "unavailable",
        "privacy_unavailable_binding",
      );
    screened.set(row.blindId, row);
  }
  return {
    acquisition,
    privacy,
    observations: acquisition.observations.map((row) => ({
      ...row,
      privacyDecision: screened.get(row.blindId).decision,
    })),
  };
}
export function createDevelopmentPlan(observations) {
  assert.ok(Array.isArray(observations) && observations.length === 21, "planned_upload_count");
  assert.equal(
    new Set(observations.map((row) => row.blindId)).size,
    21,
    "duplicate_planned_upload",
  );
  const productIds = [...new Set(observations.map((row) => row.productId))].sort();
  assert.equal(productIds.length, 5, "product_count");
  const classes = productIds.map((productId) => {
    const own = observations
      .filter((row) => row.productId === productId)
      .sort((a, b) => Number(a.originalId) - Number(b.originalId));
    assert.ok(
      own.every(
        (row) => /^[1-9]\d{0,5}$/u.test(row.originalId) && /^case-\d{3}$/u.test(row.blindId),
      ),
      "upload_identifiers",
    );
    assert.equal(
      new Set(own.map((row) => row.originalId)).size,
      own.length,
      "duplicate_product_upload",
    );
    const ready = own.filter(
      (row) => row.status === "ready" && row.privacyDecision === "allow_development",
    );
    const gallery = ready.length >= 2 ? ready.slice(0, 2).map((row) => row.blindId) : [];
    return {
      productId,
      uploads: own.length,
      sourceReady: own.filter((row) => row.status === "ready").length,
      privacyAllowedReady: ready.length,
      gallery,
      enrolled: gallery.length === 2,
      crossUploadPlanned:
        gallery.length === 2
          ? own.filter(
              (row) => !gallery.includes(row.blindId) && row.privacyDecision !== "exclude_privacy",
            ).length
          : 0,
      independentCaptureEvidence: false,
    };
  });
  const rows = observations
    .map((row) => {
      const own = classes.find((item) => item.productId === row.productId);
      const role =
        row.privacyDecision === "exclude_privacy"
          ? "privacy_excluded"
          : !own.enrolled
            ? "insufficient_gallery"
            : own.gallery.includes(row.blindId)
              ? "gallery_self"
              : "cross_upload";
      return {
        blindId: row.blindId,
        productId: row.productId,
        originalId: row.originalId,
        sourceStatus: row.status,
        privacyDecision: row.privacyDecision,
        ...(row.originalSha256 ? { originalSha256: row.originalSha256 } : {}),
        ...(row.reviewImageSha256 ? { reviewImageSha256: row.reviewImageSha256 } : {}),
        role,
        process:
          row.status === "ready" && row.privacyDecision === "allow_development" && own.enrolled,
      };
    })
    .sort((a, b) => a.blindId.localeCompare(b.blindId, "en"));
  return {
    classes,
    rows,
    humanAccepted: false,
    integrationAllowed: false,
    independentAccuracyEstablished: false,
  };
}
/** Byte/review/pixel duplicates are diagnostic flags, never new independence. */
export function duplicateGroups(records, field) {
  assert.ok(
    ["originalSha256", "reviewImageSha256", "pixelSha256"].includes(field),
    "duplicate_field",
  );
  const groups = new Map();
  for (const row of records)
    if (row[field] !== undefined) {
      assert.ok(hashPattern.test(row[field]), "duplicate_hash");
      const values = groups.get(row[field]) ?? [];
      values.push(row.blindId);
      groups.set(row[field], values);
    }
  return [...groups]
    .filter(([, ids]) => ids.length > 1)
    .map(([sha256, blindIds]) => ({ sha256, blindIds: [...blindIds].sort() }))
    .sort((a, b) => a.sha256.localeCompare(b.sha256, "en"));
}
function safeResult(result, enrolledProducts, galleries) {
  if (
    !result ||
    typeof result !== "object" ||
    ![
      "candidate",
      "ambiguous",
      "unknown",
      "invalid",
      "failed",
      "low_detail",
      "not_processed",
    ].includes(result.status)
  )
    return false;
  if (
    ["candidate", "ambiguous", "unknown"].includes(result.status) &&
    (result.algorithmVersion !== "reference-scale-affine-v2" ||
      result.featureVersion !== "pixel-scale-corners-v2" ||
      result.verificationStatus !== "inferred" ||
      result.confidence !== "uncalibrated_visual_similarity" ||
      ["bin", "verifiedGtin", "verifiedIdentity", "probability"].some((key) =>
        Object.hasOwn(result, key),
      ))
  )
    return false;
  if (result.status === "candidate") {
    const evidence = result.evidence,
      reference = evidence && galleries.get(evidence.referenceId);
    return (
      enrolledProducts.has(result.productId) &&
      reference?.productId === result.productId &&
      evidence.imageSha256 === reference.reviewImageSha256 &&
      [evidence.correspondences, evidence.inliers, evidence.hypotheses].every(Number.isInteger) &&
      evidence.inliers >= 8 &&
      evidence.inliers <= evidence.correspondences &&
      evidence.correspondences <= 128 &&
      evidence.hypotheses >= 1 &&
      evidence.hypotheses <= 256 &&
      [evidence.inlierFraction, evidence.referenceCoverage, evidence.queryCoverage].every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      )
    );
  }
  if (Object.hasOwn(result, "productId")) return false;
  if (result.status === "ambiguous")
    return (
      Array.isArray(result.productIds) &&
      result.productIds.length >= 2 &&
      result.productIds.length <= 5 &&
      new Set(result.productIds).size === result.productIds.length &&
      result.productIds.every((id) => enrolledProducts.has(id))
    );
  if (Object.hasOwn(result, "productIds")) return false;
  return (
    typeof result.reason === "string" && result.reason.length > 0 && result.reason.length <= 128
  );
}
export function summarizeDevelopment(rows, plan) {
  const expected = new Map(plan.rows.map((row) => [row.blindId, row])),
    enrolled = new Set(plan.classes.filter((row) => row.enrolled).map((row) => row.productId));
  const galleries = new Set(
    plan.rows.filter((row) => row.role === "gallery_self").map((row) => row.blindId),
  );
  const galleryRows = new Map(
    plan.rows.filter((row) => row.role === "gallery_self").map((row) => [row.blindId, row]),
  );
  let valid = false,
    owned = [];
  try {
    assert.ok(Array.isArray(rows) && rows.length <= 21);
    for (const row of rows) {
      const prior = expected.get(row.blindId);
      assert.ok(
        prior &&
          row.productId === prior.productId &&
          row.role === prior.role &&
          row.sourceStatus === prior.sourceStatus &&
          safeResult(row.result, enrolled, galleryRows),
        "diagnostic_row_join",
      );
      assert.ok(
        row.independentAccepted === false &&
          Array.isArray(row.duplicateGalleryReferences) &&
          row.duplicateGalleryReferences.length <= 10 &&
          new Set(row.duplicateGalleryReferences).size === row.duplicateGalleryReferences.length &&
          row.duplicateGalleryReferences.every((id) => galleries.has(id) && id !== row.blindId),
        "unverified_duplicate_scope",
      );
      for (const field of ["originalSha256", "reviewImageSha256"])
        assert.equal(row[field], prior[field], "source_image_binding");
      const attempts = row.attempts;
      assert.ok(
        attempts &&
          Object.keys(attempts).length === 3 &&
          ["decodes", "extractions", "matches"].every((key) => [0, 1].includes(attempts[key])),
        "attempt_count",
      );
      assert.ok(
        attempts.matches <= attempts.extractions && attempts.extractions <= attempts.decodes,
        "attempt_order",
      );
      if (!prior.process)
        assert.ok(
          row.result.status === "not_processed" &&
            Object.values(attempts).every((count) => count === 0),
          "unprocessed_attempt",
        );
      else
        assert.ok(
          attempts.decodes === 1 && row.result.status !== "not_processed",
          "missing_decode_attempt",
        );
      if (attempts.extractions === 1)
        assert.ok(
          hashPattern.test(row.pixelSha256) &&
            (hashPattern.test(row.featureSha256) || row.result.status === "failed"),
          "pixel_feature_hash_binding",
        );
      if (["candidate", "ambiguous", "unknown"].includes(row.result.status))
        assert.equal(attempts.matches, 1, "missing_match_attempt");
      if (row.result.status === "invalid")
        assert.equal(attempts.extractions, 1, "invalid_feature_or_match_attempt");
      if (row.result.status === "low_detail")
        assert.ok(attempts.extractions === 1 && attempts.matches === 0, "low_detail_attempts");
    }
    assert.equal(
      new Set(rows.map((row) => row.blindId)).size,
      rows.length,
      "duplicate_diagnostic_row",
    );
    for (const row of rows) {
      const actual = rows
        .filter(
          (other) =>
            galleries.has(other.blindId) &&
            other.blindId !== row.blindId &&
            ["originalSha256", "reviewImageSha256", "pixelSha256"].some(
              (field) => row[field] && row[field] === other[field],
            ),
        )
        .map((other) => other.blindId)
        .sort();
      assert.deepEqual(row.duplicateGalleryReferences, actual, "duplicate_receipt_reconciliation");
    }
    owned = rows;
    valid = rows.length === 21;
  } catch {
    /* Invalid/missing receipts cannot become accepted evidence. */
  }
  const stats = (role) => {
    const own = owned.filter((row) => row.role === role);
    const agrees = own.filter(
      (row) => row.result.status === "candidate" && row.result.productId === row.productId,
    );
    return {
      planned: plan.rows.filter((row) => row.role === role).length,
      observed: own.length,
      sourceLabelAgreement: agrees.length,
      sourceLabelDisagreement: own.filter(
        (row) => row.result.status === "candidate" && row.result.productId !== row.productId,
      ).length,
      abstentions: own.filter((row) =>
        ["unknown", "ambiguous", "low_detail"].includes(row.result.status),
      ).length,
      failed: own.filter((row) => row.result.status === "failed").length,
      invalid: own.filter((row) => row.result.status === "invalid").length,
      notProcessed: own.filter((row) => row.result.status === "not_processed").length,
      nonDuplicateSourceLabelAgreement: agrees.filter(
        (row) => row.duplicateGalleryReferences?.length === 0,
      ).length,
      independentAcceptedQueries: 0,
    };
  };
  return {
    diagnosticComplete: valid,
    plannedUploads: 21,
    observedRows: Array.isArray(rows) ? rows.length : 0,
    sourceFailed: plan.rows.filter((row) => row.sourceStatus === "failed").length,
    sourceNotAttempted: plan.rows.filter((row) => row.sourceStatus === "not_attempted").length,
    gallerySelf: stats("gallery_self"),
    crossUpload: stats("cross_upload"),
    insufficientGallery: stats("insufficient_gallery"),
    privacyExcluded: stats("privacy_excluded"),
    counters: Object.fromEntries(
      ["decodes", "extractions", "matches"].map((name) => [
        name,
        owned.reduce((sum, row) => sum + row.attempts[name], 0),
      ]),
    ),
    classes: plan.classes,
    diagnosticOnly: true,
    humanAccepted: false,
    integrationAllowed: false,
    releaseAccepted: false,
    independentAccuracyEstablished: false,
  };
}
function sources(cwd) {
  const names = [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "mobile/app/package.json",
    "shared/domain/package.json",
    "shared/domain/tsconfig.json",
    "scripts/__tests__/off-reference-development.test.mjs",
    "scripts/qa/local-vision/embedding-control.mjs",
    "scripts/qa/local-vision/embedding-head.mjs",
    "scripts/qa/protocols/off-reference-development-protocol.md",
  ];
  const visit = (relative) => {
    const stat = fs.lstatSync(path.join(cwd, relative));
    assert.equal(stat.isSymbolicLink(), false, "linked_source");
    if (stat.isDirectory())
      for (const name of fs.readdirSync(path.join(cwd, relative)).sort())
        visit(path.join(relative, name));
    else if (/\.(?:ts|mjs|json)$/u.test(relative)) names.push(relative);
    assert.ok(names.length <= 512, "source_count_bound");
  };
  for (const directory of ["shared/domain/src", "scripts/qa/reference-image"]) visit(directory);
  assert.equal(new Set(names).size, names.length, "duplicate_source");
  return Object.fromEntries(
    names.sort().map((name) => [name, hash(readBounded(path.join(cwd, name), 2_000_000))]),
  );
}
function boundInputs(options, cwd) {
  const acquisitionFile = checkedWorkFile(options.acquisition, cwd),
    privacyFile = checkedWorkFile(options.privacy, cwd);
  assert.match(options.acquisitionSha256, hashPattern);
  assert.match(options.privacySha256, hashPattern);
  const acquisitionBytes = readBounded(acquisitionFile, 2_000_000),
    privacyBytes = readBounded(privacyFile, 65_536);
  assert.equal(hash(acquisitionBytes), options.acquisitionSha256, "acquisition_hash");
  assert.equal(hash(privacyBytes), options.privacySha256, "privacy_hash");
  const input = parseDevelopmentInputs(
    acquisitionBytes.toString("utf8"),
    options.acquisitionSha256,
    privacyBytes.toString("utf8"),
    selected(cwd),
  );
  const directory = path.dirname(acquisitionFile),
    files = {};
  if (input.acquisition.version === "off-reference-recovery-v1") {
    const base = input.acquisition.baseAcquisition;
    assert.ok(
      typeof base.manifestFile === "string" &&
        path.basename(base.manifestFile) === "acquisition.json",
      "base_manifest_path",
    );
    const baseFile = checkedWorkFile(base.manifestFile, cwd),
      baseBytes = readBounded(baseFile, 2_000_000);
    assert.equal(hash(baseBytes), base.manifestSha256, "actual_base_manifest_hash");
    const baseManifest = JSON.parse(baseBytes);
    assert.equal(baseManifest.version, OFF_ACQUISITION_POLICY.version, "actual_base_version");
    assert.deepEqual(baseManifest.counters, base.counters, "actual_base_counter_join");
    assert.equal(baseManifest.lockSha256, base.lockSha256, "actual_base_lock_join");
    for (const row of input.acquisition.observations.filter(
      (row) => !["case-008", "case-013"].includes(row.blindId),
    ))
      assert.deepEqual(
        row,
        baseManifest.observations.find((original) => original.blindId === row.blindId),
        "unchanged_base_observation_join",
      );
    files[path.relative(cwd, baseFile)] = hash(baseBytes);
    assert.ok(typeof input.acquisition.diagnosticFile === "string", "recovery_diagnostic_path");
    const diagnosticFile = checkedWorkFile(input.acquisition.diagnosticFile, cwd),
      diagnosticBytes = readBounded(diagnosticFile, 1_000_000);
    assert.equal(
      hash(diagnosticBytes),
      input.acquisition.diagnosticSha256,
      "actual_recovery_diagnostic_hash",
    );
    files[path.relative(cwd, diagnosticFile)] = hash(diagnosticBytes);
  }
  for (const row of input.observations) {
    const receiptFile = checkedWorkFile(path.join(directory, `${row.blindId}-receipt.json`), cwd);
    const receipt = readBounded(receiptFile, 65_536);
    const { privacyDecision: _, ...originalRow } = row;
    assert.deepEqual(JSON.parse(receipt), originalRow, "acquisition_receipt_join");
    files[path.relative(cwd, receiptFile)] = hash(receipt);
    for (const [fileKey, hashKey, maximum] of [
      ["originalFile", "originalSha256", OFF_ACQUISITION_POLICY.maximumImageBytes],
      ["reviewFile", "reviewImageSha256", OFF_ACQUISITION_POLICY.maximumReviewBytes],
    ])
      if (row[fileKey]) {
        const file = checkedWorkFile(path.join(directory, row[fileKey]), cwd),
          bytes = readBounded(file, maximum);
        assert.equal(hash(bytes), row[hashKey], "acquired_image_hash_join");
        if (fileKey === "originalFile")
          assert.equal(bytes.length, row.originalBytes, "original_byte_count");
        files[path.relative(cwd, file)] = hash(bytes);
      }
  }
  return {
    ...input,
    directory,
    binding: {
      acquisition: path.relative(cwd, acquisitionFile),
      acquisitionSha256: options.acquisitionSha256,
      privacy: path.relative(cwd, privacyFile),
      privacySha256: options.privacySha256,
      files,
    },
    plan: createDevelopmentPlan(input.observations),
  };
}
export function parseArguments(args) {
  if (
    args.length === 6 &&
    args[0] === "--freeze" &&
    hashPattern.test(args[2]) &&
    hashPattern.test(args[4])
  )
    return {
      mode: "freeze",
      acquisition: args[1],
      acquisitionSha256: args[2],
      privacy: args[3],
      privacySha256: args[4],
      output: args[5],
    };
  if (args.length === 4 && args[0] === "--run" && hashPattern.test(args[2]))
    return { mode: "run", lock: args[1], lockSha256: args[2], output: args[3] };
  throw new Error(
    "Use --freeze acquisition.json sha256 privacy.json sha256 work/new-freeze OR --run work/lock.json sha256 work/new-result",
  );
}
export async function freezeDevelopment(options, cwd = project) {
  assert.equal(
    fs.lstatSync(path.join(cwd, ledger), { throwIfNoEntry: false }),
    undefined,
    "development_already_attempted",
  );
  const output = checkedOutput(options.output, cwd),
    input = boundInputs(options, cwd),
    snapshot = sources(cwd),
    decoder = loadPinnedReferenceDecoder(cwd);
  fs.mkdirSync(output, { mode: 0o700 });
  const requireMobile = createRequire(path.join(cwd, "mobile/app/package.json"));
  const entry = requireMobile.resolve("@kierratysappi/domain/reference-vision");
  await build({
    entry: [entry],
    outDir: path.join(output, "engine"),
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    bundle: true,
    splitting: false,
    noExternal: ["zod"],
    silent: true,
    clean: false,
  });
  const engine = path.join(output, "engine/reference-vision.mjs"),
    engineSha256 = hash(readBounded(engine, 4_000_000));
  assert.deepEqual(sources(cwd), snapshot, "source_drift_during_freeze");
  assert.deepEqual(boundInputs(options, cwd).binding, input.binding, "data_drift_during_freeze");
  const saved = writeJsonExclusive(
    path.join(output, "lock.json"),
    {
      schemaVersion: "off-cross-upload-development-lock-v1",
      policy: OFF_DEVELOPMENT_POLICY,
      sources: snapshot,
      binding: input.binding,
      plan: input.plan,
      decoderIdentity: decoder.identity,
      decoderLockSha256: decoder.lockSha256,
      decodePolicy: NODE_REFERENCE_DECODE_POLICY,
      engine: path.relative(cwd, engine),
      engineSha256,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      imageCallsBeforeLock: 0,
      humanAccepted: false,
      integrationAllowed: false,
    },
    cwd,
  );
  return {
    lock: path.relative(cwd, saved.path),
    sha256: saved.sha256,
    plannedUploads: 21,
    imageCalls: 0,
  };
}
export async function runDevelopment(options, cwd = project) {
  const lockBytes = readBounded(checkedWorkFile(options.lock, cwd), 2_000_000);
  assert.equal(hash(lockBytes), options.lockSha256, "development_lock_hash");
  const lock = JSON.parse(lockBytes);
  assert.ok(
    lock.schemaVersion === "off-cross-upload-development-lock-v1" &&
      lock.humanAccepted === false &&
      lock.integrationAllowed === false &&
      lock.imageCallsBeforeLock === 0,
    "development_lock_scope",
  );
  assert.deepEqual(lock.policy, OFF_DEVELOPMENT_POLICY);
  const input = boundInputs({ ...lock.binding }, cwd),
    decoder = loadPinnedReferenceDecoder(cwd);
  assert.deepEqual(input.binding, lock.binding, "input_drift");
  assert.deepEqual(input.plan, lock.plan, "plan_drift");
  assert.deepEqual(sources(cwd), lock.sources, "source_drift");
  assert.deepEqual(decoder.identity, lock.decoderIdentity, "decoder_drift");
  assert.equal(decoder.lockSha256, lock.decoderLockSha256);
  assert.equal(lock.decodePolicy, NODE_REFERENCE_DECODE_POLICY);
  assert.equal(lock.node, process.version);
  assert.equal(lock.platform, `${process.platform}-${process.arch}`);
  const enginePath = checkedWorkFile(lock.engine, cwd);
  assert.equal(
    hash(readBounded(enginePath, 4_000_000)),
    lock.engineSha256,
    "compiled_engine_drift",
  );
  const output = checkedOutput(options.output, cwd);
  writeJsonExclusive(
    path.join(cwd, ledger),
    {
      experimentId: OFF_DEVELOPMENT_POLICY.id,
      lockSha256: options.lockSha256,
      output: path.relative(cwd, output),
    },
    cwd,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  const api = await import(pathToFileURL(enginePath).href),
    ports = createNodeReferencePorts(decoder.sharp);
  assert.ok(
    typeof api.extractReferenceImageFeaturesV2 === "function" &&
      typeof api.matchReferenceImageV2 === "function",
    "engine_entries",
  );
  const prepared = new Map(),
    rows = [],
    counters = {
      decodes: 0,
      extractions: 0,
      matches: 0,
      pretrainedPredictions: 0,
      trainingCalls: 0,
      paidRequests: 0,
    };
  for (const plan of input.plan.rows) {
    const source = input.observations.find((row) => row.blindId === plan.blindId),
      attempts = { decodes: 0, extractions: 0, matches: 0 };
    let feature, result, pixelSha256;
    if (!plan.process)
      result = {
        status: "not_processed",
        reason: source.status !== "ready" ? `source_${source.status}` : plan.role,
      };
    else {
      const bytes = readBounded(
        checkedWorkFile(path.join(input.directory, source.reviewFile), cwd),
        OFF_ACQUISITION_POLICY.maximumReviewBytes,
      );
      assert.equal(hash(bytes), source.reviewImageSha256, "review_image_drift");
      try {
        counters.decodes++;
        attempts.decodes = 1;
        assert.ok(counters.decodes <= 21, "decode_budget");
        const rgb = await ports.decodeRgb(new Uint8Array(bytes), {
          maximumDimension: 1024,
          maximumPixels: 1048576,
        });
        assert.ok(
          rgb.width === source.width && rgb.height === source.height,
          "review_dimension_join",
        );
        pixelSha256 = hash(
          Buffer.concat([Buffer.from(`${rgb.width}x${rgb.height}/rgb8\0`), Buffer.from(rgb.data)]),
        );
        counters.extractions++;
        attempts.extractions = 1;
        assert.ok(counters.extractions <= 21, "extraction_budget");
        feature = api.extractReferenceImageFeaturesV2(rgb);
        if (feature.status !== "ok") result = { status: feature.status, reason: feature.reason };
      } catch {
        result = {
          status: "failed",
          reason: attempts.extractions ? "extraction_failed" : "decode_failed",
        };
      }
    }
    const record = {
      ...plan,
      ...(pixelSha256 ? { pixelSha256 } : {}),
      featureSha256: feature ? hash(JSON.stringify(feature)) : null,
      keypoints: feature?.status === "ok" ? feature.features.keypoints.length : 0,
      attempts,
      ...(result ? { result } : {}),
    };
    prepared.set(plan.blindId, { record, feature });
    writeJsonExclusive(path.join(output, `${plan.blindId}-preparation.json`), record, cwd);
  }
  // Keep the selected two uploads fixed. Missing/low-detail descriptors are not
  // replaced after seeing results, and identical bytes are not independence.
  const catalogue = input.plan.rows
    .filter((row) => row.role === "gallery_self")
    .flatMap((row) => {
      const { feature } = prepared.get(row.blindId),
        source = input.observations.find((item) => item.blindId === row.blindId);
      return feature?.status === "ok"
        ? [
            {
              productId: row.productId,
              referenceId: row.blindId,
              imageSha256: source.reviewImageSha256,
              features: feature.features,
            },
          ]
        : [];
    });
  const preparedRecords = [...prepared.values()].map((entry) => entry.record);
  const duplicates = Object.fromEntries(
    ["originalSha256", "reviewImageSha256", "pixelSha256"].map((name) => [
      name,
      duplicateGroups(preparedRecords, name),
    ]),
  );
  const galleries = preparedRecords.filter((row) => row.role === "gallery_self");
  for (const plan of input.plan.rows) {
    const { record, feature } = prepared.get(plan.blindId);
    let result = record.result;
    if (feature?.status === "ok") {
      counters.matches++;
      record.attempts.matches = 1;
      assert.ok(counters.matches <= 21, "match_budget");
      try {
        result = api.matchReferenceImageV2(feature.features, catalogue);
      } catch {
        result = { status: "failed", reason: "matcher_threw" };
      }
    }
    const duplicateGalleryReferences = galleries
      .filter(
        (gallery) =>
          gallery.blindId !== record.blindId &&
          ["originalSha256", "reviewImageSha256", "pixelSha256"].some(
            (field) => record[field] && record[field] === gallery[field],
          ),
      )
      .map((gallery) => gallery.blindId)
      .sort();
    const row = { ...record, result, duplicateGalleryReferences, independentAccepted: false };
    rows.push(row);
    writeJsonExclusive(path.join(output, `${plan.blindId}-result.json`), row, cwd);
  }
  const measured = summarizeDevelopment(rows, input.plan);
  assert.deepEqual(
    measured.counters,
    { decodes: counters.decodes, extractions: counters.extractions, matches: counters.matches },
    "attempt_receipt_mismatch",
  );
  assert.deepEqual(sources(cwd), lock.sources, "source_drift_after_calls");
  assert.deepEqual(boundInputs(lock.binding, cwd).binding, lock.binding, "data_drift_after_calls");
  assert.deepEqual(
    loadPinnedReferenceDecoder(cwd).identity,
    lock.decoderIdentity,
    "decoder_drift_after_calls",
  );
  assert.equal(
    hash(readBounded(enginePath, 4_000_000)),
    lock.engineSha256,
    "compiled_engine_drift_after_calls",
  );
  const saved = writeJsonExclusive(
    path.join(output, "summary.json"),
    {
      schemaVersion: "off-cross-upload-development-result-v1",
      lockSha256: options.lockSha256,
      ...measured,
      counters,
      duplicates,
      catalogueReferences: catalogue.map(({ productId, referenceId, imageSha256 }) => ({
        productId,
        referenceId,
        imageSha256,
      })),
      rows,
    },
    cwd,
  );
  return {
    output: path.relative(cwd, output),
    sha256: saved.sha256,
    ...measured,
    counters,
    duplicates,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  console.log(
    JSON.stringify(
      options.mode === "freeze" ? await freezeDevelopment(options) : await runDevelopment(options),
      null,
      2,
    ),
  );
}
