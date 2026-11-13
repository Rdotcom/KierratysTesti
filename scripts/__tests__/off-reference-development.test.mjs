import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  OFF_ACQUISITION_POLICY,
  parseSelection,
} from "../qa/reference-image/acquire-off-references.mjs";
import {
  createDevelopmentPlan,
  duplicateGroups,
  OFF_DEVELOPMENT_POLICY,
  parseArguments,
  parseDevelopmentInputs,
  summarizeDevelopment,
} from "../qa/reference-image/evaluate-off-development.mjs";

const entries = parseSelection(
  fs.readFileSync(
    new URL("../qa/reference-image/off-initial-selection.json", import.meta.url),
    "utf8",
  ),
);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const tag = (number) => number.toString(16).padStart(64, "0");
const metadata = {
  algorithmVersion: "reference-scale-affine-v2",
  featureVersion: "pixel-scale-corners-v2",
  verificationStatus: "inferred",
  confidence: "uncalibrated_visual_similarity",
};
function fixture(failedIds = []) {
  const observations = entries.map((row, index) =>
    failedIds.includes(row.blindId)
      ? { ...row, status: "failed", reason: "response_type", bytesReceived: 0 }
      : {
          ...row,
          status: "ready",
          originalSha256: tag(index + 1),
          originalFile: `originals/${row.blindId}.jpg`,
          originalBytes: 4,
          reviewImageSha256: tag(index + 101),
          reviewFile: `blind/images/${row.blindId}.png`,
          reviewTransform: OFF_ACQUISITION_POLICY.reviewTransform,
          width: 64,
          height: 64,
        },
  );
  const ready = 21 - failedIds.length;
  const acquisition = {
    version: OFF_ACQUISITION_POLICY.version,
    selectionSha256: "904d38041e528dfaff897ebcef3f8bd5436411a7b1d138cd561bb9d397170ef8",
    lockSha256: tag(600),
    integrationAllowed: false,
    humanAccepted: false,
    captureIndependence: "unverified",
    split: "unassigned",
    counters: {
      planned: 21,
      requests: 21,
      downloaded: ready,
      decodes: ready,
      reviewEncodes: ready,
      ready,
      failed: failedIds.length,
      notAttempted: 0,
      featureExtractions: 0,
      matcherCalls: 0,
      trainingCalls: 0,
      paidRequests: 0,
    },
    observations,
  };
  const text = JSON.stringify(acquisition),
    digest = sha(text);
  const privacy = {
    schemaVersion: "off-development-privacy-screen-v1",
    acquisitionSha256: digest,
    humanAccepted: false,
    integrationAllowed: false,
    rows: observations.map((row) => ({
      blindId: row.blindId,
      reviewImageSha256: row.reviewImageSha256 ?? null,
      decision: row.status === "ready" ? "allow_development" : "unavailable",
    })),
  };
  return { acquisition, privacy, text, digest };
}
const parsed = (value = fixture()) =>
  parseDevelopmentInputs(value.text, value.digest, JSON.stringify(value.privacy), entries);
const planned = () => createDevelopmentPlan(parsed().observations);
function resultRows(plan) {
  return plan.rows.map((row, index) => {
    const reference = plan.rows.find(
      (other) => other.role === "gallery_self" && other.productId === row.productId,
    );
    return {
      ...row,
      pixelSha256: row.process ? tag(index + 301) : undefined,
      featureSha256: row.process ? tag(index + 401) : null,
      attempts: {
        decodes: Number(row.process),
        extractions: Number(row.process),
        matches: Number(row.process),
      },
      result: row.process
        ? {
            ...metadata,
            status: "candidate",
            productId: row.productId,
            evidence: {
              referenceId: reference.blindId,
              imageSha256: reference.reviewImageSha256,
              correspondences: 12,
              inliers: 12,
              inlierFraction: 1,
              referenceCoverage: 0.1,
              queryCoverage: 0.1,
              hypotheses: 1,
            },
          }
        : { status: "not_processed", reason: "insufficient_gallery" },
      duplicateGalleryReferences: [],
      independentAccepted: false,
    };
  });
}

test("pre-call numeric enrollment is fixed:8self/12cross-upload/1insufficient, never independent acceptance", () => {
  const plan = planned();
  assert.equal(plan.rows.filter((row) => row.role === "gallery_self").length, 8);
  assert.equal(plan.rows.filter((row) => row.role === "cross_upload").length, 12);
  assert.equal(plan.rows.filter((row) => row.role === "insufficient_gallery").length, 1);
  assert.equal(plan.classes.find((row) => row.productId === "off-5449000000996").enrolled, false);
  assert.equal(
    plan.classes.find((row) => row.productId === "off-7622210449283").crossUploadPlanned,
    0,
  );
  for (const row of plan.classes.filter((row) => row.enrolled)) {
    const expected = entries
      .filter((entry) => entry.productId === row.productId)
      .sort((a, b) => Number(a.originalId) - Number(b.originalId))
      .slice(0, 2)
      .map((entry) => entry.blindId);
    assert.deepEqual(row.gallery, expected);
    assert.equal(row.independentCaptureEvidence, false);
  }
  assert.equal(plan.integrationAllowed, false);
  assert.equal(OFF_DEVELOPMENT_POLICY.releaseAccepted, false);
});

test("acquisition, exact source assignment, byte joins, pending flags and privacy decisions fail closed", () => {
  for (const edit of [
    (v) => {
      v.acquisition.humanAccepted = true;
    },
    (v) => {
      v.acquisition.observations[0].productId = "invented";
    },
    (v) => {
      v.acquisition.observations[0].originalFile = "../private.jpg";
    },
    (v) => {
      v.acquisition.observations[0].reviewImageSha256 = "bad";
    },
    (v) => {
      v.acquisition.observations[0].split = "enrollment";
    },
    (v) => {
      v.acquisition.counters.ready = 0;
    },
    (v) => {
      v.acquisition.counters.matcherCalls = 1;
    },
    (v) => {
      v.acquisition.observations.pop();
    },
  ]) {
    const value = fixture();
    edit(value);
    value.text = JSON.stringify(value.acquisition);
    value.digest = sha(value.text);
    value.privacy.acquisitionSha256 = value.digest;
    assert.throws(() => parsed(value));
  }
  for (const edit of [
    (v) => {
      v.privacy.humanAccepted = true;
    },
    (v) => {
      v.privacy.rows[0].decision = "accepted";
    },
    (v) => {
      v.privacy.rows[0].reviewImageSha256 = tag(999);
    },
    (v) => {
      v.privacy.rows.push(v.privacy.rows[0]);
    },
  ]) {
    const value = fixture();
    edit(value);
    assert.throws(() => parsed(value));
  }
  assert.throws(() => parseDevelopmentInputs(" ".repeat(2_000_001), tag(1), "{}", entries));
  const value = fixture();
  assert.throws(() =>
    parseDevelopmentInputs(value.text, tag(1), JSON.stringify(value.privacy), entries),
  );
});

test("privacy exclusions and failed source cases stay in the fixed21-case plan without image calls", () => {
  const value = fixture(["case-008", "case-013"]);
  value.privacy.rows[0].decision = "exclude_privacy";
  const plan = createDevelopmentPlan(parsed(value).observations);
  assert.equal(plan.rows.length, 21);
  assert.equal(plan.rows.find((row) => row.blindId === "case-001").role, "privacy_excluded");
  assert.equal(plan.rows.find((row) => row.blindId === "case-013").process, false);
  assert.ok(plan.rows.some((row) => row.sourceStatus === "failed"));
});

test("a complete diagnostic can never become product accuracy, human review or a release gate", () => {
  const plan = planned(),
    summary = summarizeDevelopment(resultRows(plan), plan);
  assert.equal(summary.diagnosticComplete, true);
  assert.equal(summary.gallerySelf.sourceLabelAgreement, 8);
  assert.equal(summary.crossUpload.sourceLabelAgreement, 12);
  assert.deepEqual(summary.counters, { decodes: 20, extractions: 20, matches: 20 });
  for (const key of [
    "humanAccepted",
    "integrationAllowed",
    "releaseAccepted",
    "independentAccuracyEstablished",
  ])
    assert.equal(summary[key], false);
  assert.equal(summary.crossUpload.independentAcceptedQueries, 0);
  assert.equal(summary.insufficientGallery.notProcessed, 1);
});

test("missing, duplicate, substituted, unverified-source or fabricated-probability receipts cannot complete", () => {
  for (const edit of [
    (rows) => rows.pop(),
    (rows) => {
      rows[1] = rows[0];
    },
    (rows) => {
      rows[0].productId = "invented";
    },
    (rows) => {
      rows[0].result.verificationStatus = "verified";
    },
    (rows) => {
      rows[0].result.probability = 1;
    },
    (rows) => {
      rows[0].result.evidence.referenceId = "unlisted";
    },
    (rows) => {
      rows[0].result.evidence.imageSha256 = tag(999);
    },
    (rows) => {
      rows[0].attempts.matches = 0;
    },
    (rows) => {
      rows[0].independentAccepted = true;
    },
    (rows) => {
      rows[0].result.status = "made_up_success";
    },
  ]) {
    const plan = planned(),
      rows = resultRows(plan);
    edit(rows);
    assert.equal(summarizeDevelopment(rows, plan).diagnosticComplete, false);
  }
});

test("known cross-gallery pixel duplicates are reconciled and excluded from nonduplicate subtotals", () => {
  const plan = planned(),
    rows = resultRows(plan),
    query = rows.find((row) => row.role === "cross_upload"),
    reference = rows.find(
      (row) => row.role === "gallery_self" && row.productId === query.productId,
    );
  query.pixelSha256 = reference.pixelSha256;
  assert.equal(summarizeDevelopment(rows, plan).diagnosticComplete, false);
  query.duplicateGalleryReferences = [reference.blindId];
  reference.duplicateGalleryReferences = [];
  const summary = summarizeDevelopment(rows, plan);
  assert.equal(summary.diagnosticComplete, true);
  assert.equal(summary.crossUpload.sourceLabelAgreement, 12);
  assert.equal(summary.crossUpload.nonDuplicateSourceLabelAgreement, 11);
  assert.equal(duplicateGroups(rows, "pixelSha256").length, 1);
  assert.throws(() => duplicateGroups(rows, "untrustedField"));
});

test("low-detail, ambiguous and operational failure remain distinct outcomes and counted attempts", () => {
  const plan = planned(),
    rows = resultRows(plan),
    own = rows.filter((row) => row.role === "cross_upload");
  own[0].result = { status: "low_detail", reason: "few_features" };
  own[0].attempts.matches = 0;
  own[1].result = {
    ...metadata,
    status: "ambiguous",
    productIds: plan.classes
      .filter((row) => row.enrolled)
      .slice(0, 2)
      .map((row) => row.productId),
  };
  own[2].result = { status: "failed", reason: "decode_failed" };
  own[2].attempts = { decodes: 1, extractions: 0, matches: 0 };
  own[2].featureSha256 = null;
  delete own[2].pixelSha256;
  const summary = summarizeDevelopment(rows, plan);
  assert.equal(summary.diagnosticComplete, true);
  assert.equal(summary.crossUpload.abstentions, 2);
  assert.equal(summary.crossUpload.failed, 1);
  assert.equal(summary.counters.matches, 18);
  assert.equal(summary.counters.decodes, 20);
});

test("closed CLI modes disallow implicit data runs or hidden retry modes", () => {
  assert.equal(
    parseArguments([
      "--freeze",
      "work/acquisition.json",
      tag(1),
      "work/privacy.json",
      tag(2),
      "work/new",
    ]).mode,
    "freeze",
  );
  assert.equal(parseArguments(["--run", "work/lock.json", tag(1), "work/new"]).mode, "run");
  for (const args of [
    [],
    ["--run"],
    ["--retry", "work/a"],
    ["--run", "work/a", "bad", "work/new"],
    ["--freeze", "work/a", tag(1), "work/b", tag(2), "work/c", "--force"],
  ])
    assert.throws(() => parseArguments(args));
});
