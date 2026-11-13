import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  OFF_ACQUISITION_POLICY,
  parseSelection,
} from "../qa/reference-image/acquire-off-references.mjs";
import {
  fetchRecoveryImage,
  OFF_RECOVERY_CASES,
  OFF_RECOVERY_INPUTS,
  OFF_RECOVERY_POLICY,
  parseRecoveryInputs,
  summarizeRecovery,
} from "../qa/reference-image/recover-off-references.mjs";

const selection = fs.readFileSync(
  new URL("../qa/reference-image/off-initial-selection.json", import.meta.url),
  "utf8",
);
const sha = (number) => number.toString(16).padStart(64, "0");
function fixture() {
  const entries = parseSelection(selection);
  const observations = entries.map((row, index) =>
    OFF_RECOVERY_CASES.some((item) => item.blindId === row.blindId)
      ? { ...row, status: "failed", reason: "response_type", bytesReceived: 0 }
      : {
          ...row,
          status: "ready",
          bytesReceived: 4,
          originalBytes: 4,
          originalSha256: sha(index + 1),
          originalFile: `originals/${row.blindId}.jpg`,
          reviewImageSha256: sha(index + 101),
          reviewFile: `blind/images/${row.blindId}.png`,
          reviewTransform: OFF_ACQUISITION_POLICY.reviewTransform,
          width: 64,
          height: 64,
        },
  );
  const base = {
    version: OFF_ACQUISITION_POLICY.version,
    lockSha256: sha(500),
    selectionSha256: "904d38041e528dfaff897ebcef3f8bd5436411a7b1d138cd561bb9d397170ef8",
    integrationAllowed: false,
    humanAccepted: false,
    captureIndependence: "unverified",
    split: "unassigned",
    observations,
    counters: {
      planned: 21,
      requests: 21,
      bytesReceived: 76,
      downloaded: 19,
      decodes: 19,
      reviewEncodes: 19,
      ready: 19,
      failed: 2,
      notAttempted: 0,
      featureExtractions: 0,
      matcherCalls: 0,
      trainingCalls: 0,
      paidRequests: 0,
    },
  };
  const diagnostic = {
    schemaVersion: "off-reference-head-diagnostic-v1",
    acquisitionSha256: OFF_RECOVERY_INPUTS.manifestSha256,
    metadataRequests: 2,
    getRequests: 0,
    bodyReads: 0,
    decodes: 0,
    featureExtractions: 0,
    matcherCalls: 0,
    retries: 0,
    redirectsFollowed: 0,
    assessment: {
      integrationAllowed: false,
      humanAccepted: false,
      captureIndependence: "unverified",
      split: "unassigned",
    },
    results: OFF_RECOVERY_CASES.map((row) => ({
      blindId: row.blindId,
      url: row.imageUrl,
      method: "HEAD",
      status: 200,
      contentType: "application/octet-stream",
      contentLength: "10000",
      bodyRead: false,
      redirectFollowed: false,
    })),
  };
  return { base, diagnostic };
}
const parsed = ({ base, diagnostic }) =>
  parseRecoveryInputs(JSON.stringify(base), JSON.stringify(diagnostic), selection);
const jpeg = () => Uint8Array.of(255, 216, 255, 217);

test("exact-two recovery preserves the first19ready/2failed plan and never accepts identity or splits", () => {
  const result = parsed(fixture());
  assert.deepEqual(
    result.entries.map((row) => row.blindId),
    ["case-008", "case-013"],
  );
  assert.equal(result.base.counters.failed, 2);
  assert.equal(result.base.observations.length, 21);
  assert.equal(OFF_RECOVERY_POLICY.maximumRequests, 2);
  assert.equal(OFF_RECOVERY_POLICY.integrationAllowed, false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.base));
  for (const row of result.entries) {
    assert.equal(row.identityReview, "pending");
    assert.equal(row.split, "unassigned");
  }
});

test("wrong source identities, missing failure evidence, changed counters and fake HEAD proof are rejected", () => {
  for (const edit of [
    (v) => {
      v.base.humanAccepted = true;
    },
    (v) => {
      v.base.observations[0].gtin = "0000000000000";
    },
    (v) => {
      v.base.observations.find((r) => r.blindId === "case-008").reason = "http_error";
    },
    (v) => {
      v.base.counters.failed = 0;
    },
    (v) => {
      v.diagnostic.getRequests = 1;
    },
    (v) => {
      v.diagnostic.results[0].url = "https://evil.example/private";
    },
    (v) => {
      v.diagnostic.results[0].method = "GET";
    },
    (v) => {
      v.diagnostic.results[0].bodyRead = true;
    },
    (v) => {
      v.diagnostic.results[0].contentType = "image/png";
    },
    (v) => {
      v.diagnostic.results.pop();
    },
  ]) {
    const value = fixture();
    edit(value);
    assert.throws(() => parsed(value));
  }
});

test("generic binary MIME normalization is limited to the two fixed official JPEG paths", async () => {
  let calls = 0;
  const result = await fetchRecoveryImage(
    OFF_RECOVERY_CASES[0],
    async (url, options) => {
      calls++;
      assert.equal(url, OFF_RECOVERY_CASES[0].imageUrl);
      assert.equal(options.redirect, "error");
      return new Response(jpeg(), {
        headers: { "content-type": "application/octet-stream", "content-length": "4" },
      });
    },
    OFF_RECOVERY_POLICY.maximumTotalBytes,
  );
  assert.equal(calls, 1);
  assert.equal(result.status, "downloaded");
  assert.deepEqual(result.bytes, jpeg());
  assert.deepEqual(result.responseMetadata, {
    httpStatus: 200,
    originalContentType: "application/octet-stream",
    normalizedContentType: "image/jpeg",
    genericMimeException: true,
  });
  await assert.rejects(
    fetchRecoveryImage(
      { ...OFF_RECOVERY_CASES[0], imageUrl: "https://evil.example/private" },
      async () => {
        calls++;
      },
      4,
    ),
  );
  await assert.rejects(
    fetchRecoveryImage(
      { ...OFF_RECOVERY_CASES[0], blindId: "case-001" },
      async () => {
        calls++;
      },
      4,
    ),
  );
  assert.equal(calls, 1);
});

test("normalization does not admit HTML, SVG, bad signature, redirects or oversized bodies", async () => {
  for (const [source, reason] of [
    [
      new Response("<svg></svg>", { headers: { "content-type": "application/octet-stream" } }),
      "image_signature",
    ],
    [new Response(jpeg(), { headers: { "content-type": "text/html" } }), "response_type"],
    [
      new Response("moved", { status: 302, headers: { location: "https://evil.example/" } }),
      "http_error",
    ],
    [
      new Response(jpeg(), {
        headers: { "content-type": "application/octet-stream", "content-length": "2097153" },
      }),
      "response_bound",
    ],
  ]) {
    let calls = 0;
    const result = await fetchRecoveryImage(
      OFF_RECOVERY_CASES[1],
      async () => {
        calls++;
        return source;
      },
      OFF_RECOVERY_POLICY.maximumTotalBytes,
    );
    assert.equal(result.status, "failed");
    assert.equal(result.reason, reason);
    assert.equal(calls, 1);
    assert.ok(!("bytes" in result));
  }
});

test("completion separates successful final rows from historical failed attempts and reused assets", () => {
  const { base } = fixture(),
    rows = base.observations.map((row) => ({ ...row, status: "ready" }));
  const summary = summarizeRecovery(
    base.counters,
    { requests: 2, bytesReceived: 8, downloaded: 2, decodes: 2, reviewEncodes: 2, failed: 0 },
    rows,
  );
  assert.equal(summary.requests, 23);
  assert.equal(summary.ready, 21);
  assert.equal(summary.failed, 0);
  assert.equal(summary.failedAttempts, 2);
  assert.equal(summary.copiedOriginals, 19);
  assert.equal(summary.copiedReviewImages, 19);
  for (const field of ["featureExtractions", "matcherCalls", "trainingCalls", "paidRequests"])
    assert.equal(summary[field], 0);
});

test("recovery keeps durable dispatch/download evidence and does not swallow local write failures", () => {
  const source = fs.readFileSync(
    new URL("../qa/reference-image/recover-off-references.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(
    source.search(/`\$\{entry\.blindId\}-dispatch\.json`/u) <
      source.indexOf("const fetched = await fetchRecoveryImage("),
  );
  assert.ok(
    source.search(/`\$\{entry\.blindId\}-download\.json`/u) <
      source.search(/path\.join\(output,\s*row\.originalFile\)/u),
  );
  assert.match(source, /if \(review\)/u);
});
