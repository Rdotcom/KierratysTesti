import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  acquireReferences,
  blankReview,
  fetchImage,
  freezeAcquisition,
  OFF_ACQUISITION_POLICY,
  parseSelection,
  renderBlindPage,
  writeBytes,
} from "../qa/reference-image/acquire-off-references.mjs";

const serialized = fs.readFileSync(
  new URL("../qa/reference-image/off-initial-selection.json", import.meta.url),
  "utf8",
);
const plan = () => parseSelection(serialized);
const jpeg = () => Uint8Array.of(255, 216, 255, 217);
const budget = OFF_ACQUISITION_POLICY.maximumTotalBytes;
const response = (bytes = jpeg(), headers = {}) =>
  new Response(bytes, { headers: { "content-type": "image/jpeg", ...headers } });
function temporaryWorkspace() {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "kig-acquisition-test-")),
  );
  fs.mkdirSync(path.join(directory, "work"));
  return directory;
}

test("source plan has exactly21 opaque uniquely keyed uploads and no accepted identities/splits", () => {
  const entries = plan();
  assert.equal(entries.length, 21);
  assert.equal(new Set(entries.map((row) => row.imageUrl)).size, 21);
  assert.deepEqual(
    entries.map((row) => row.blindId),
    Array.from({ length: 21 }, (_, index) => `case-${String(index + 1).padStart(3, "0")}`),
  );
  for (const row of entries) {
    assert.equal(row.identityReview, "pending");
    assert.equal(row.rightsAndPrivacyReview, "pending");
    assert.equal(row.captureIndependence, "unverified");
    assert.equal(row.split, "unassigned");
    assert.ok(!("capturedOn" in row));
  }
  assert.equal(OFF_ACQUISITION_POLICY.integrationAllowed, false);
  assert.equal(OFF_ACQUISITION_POLICY.automaticAcceptance, false);
});

test("serialized metadata bounds/strict identity/rights/source URLs prevent arbitrary acquisition", () => {
  for (const edit of [
    (value) => {
      value.integrationAllowed = true;
    },
    (value) => {
      value.humanAccepted = true;
    },
    (value) => {
      value.proposedImageLicense = "CC-BY-3.0";
    },
    (value) => {
      value.products[0].gtin = "0000000000000";
    },
    (value) => {
      value.products[0].extra = "untrusted";
    },
    (value) => {
      value.products[0].images[0].imageUrl = "http://127.0.0.1/private";
    },
    (value) => {
      value.products[0].images[0].imageUrl += "?redirect=private";
    },
    (value) => {
      value.products[0].images[0].originalId = "../private";
    },
    (value) => {
      value.products[0].images[0].identityReview = "accepted";
    },
    (value) => {
      value.products[0].images[0].captureIndependence = "verified";
    },
    (value) => {
      value.products[0].images[0].split = "independent_query";
    },
    (value) => {
      value.products[0].images[0].uploadedOn = "2026-02-30";
    },
    (value) => {
      value.products[0].images[0].authorCredit = "bad\ncredit";
    },
    (value) => {
      value.products[0].images[0].selectedViews = ["../private"];
    },
    (value) => {
      value.products[0].images[1] = value.products[0].images[0];
    },
    (value) => {
      value.products[0].images.pop();
    },
  ]) {
    const value = JSON.parse(serialized);
    edit(value);
    assert.throws(() => parseSelection(JSON.stringify(value)));
  }
  for (const input of [null, {}, "bad-json", " ".repeat(65537)])
    assert.throws(() => parseSelection(input));
});

test("fetch dispatch uses exact official source, no redirects/auth, bounded deadline and owned bytes", async () => {
  const entry = plan()[0];
  let calls = 0;
  const result = await fetchImage(
    entry,
    async (url, options) => {
      calls++;
      assert.equal(url, entry.imageUrl);
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.headers.Accept, "image/jpeg");
      return response(jpeg(), { "content-length": "4" });
    },
    budget,
  );
  assert.equal(calls, 1);
  assert.equal(result.status, "downloaded");
  assert.equal(result.bytesReceived, 4);
  assert.equal(Object.getPrototypeOf(result.bytes), Uint8Array.prototype);
  assert.deepEqual(result.bytes, jpeg());
});

test("direct fetch helper refuses SSRF substitutions and invalid budgets before transport", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return response();
  };
  for (const imageUrl of [
    "https://127.0.0.1/private",
    "https://openfoodfacts-images.s3.eu-west-3.amazonaws.com@evil.example/a",
    `${plan()[0].imageUrl}?x=1`,
  ])
    await assert.rejects(fetchImage({ ...plan()[0], imageUrl }, fetcher, budget));
  for (const remaining of [0, -1, Infinity, budget + 1, 1.5])
    await assert.rejects(fetchImage(plan()[0], fetcher, remaining));
  assert.equal(calls, 0);
});

test("HTTP, type, declared size and signature failures do not turn into usable images", async () => {
  for (const [source, reason] of [
    [new Response("denied", { status: 403 }), "http_error"],
    [new Response("moved", { status: 302 }), "http_error"],
    [response(jpeg(), { "content-type": "text/html" }), "response_type"],
    [response(jpeg(), { "content-length": String(2 * 1024 * 1024 + 1) }), "response_bound"],
    [response(jpeg(), { "content-length": "bad" }), "response_bound"],
    [response(jpeg(), { "content-length": "5" }), "response_length"],
    [response(new TextEncoder().encode("<svg></svg>")), "image_signature"],
    [new Response(null, { headers: { "content-type": "image/jpeg" } }), "empty_response"],
  ]) {
    let calls = 0;
    const result = await fetchImage(
      plan()[0],
      async () => {
        calls++;
        return source;
      },
      budget,
    );
    assert.equal(result.status, "failed");
    assert.equal(result.reason, reason);
    assert.ok(!("bytes" in result));
    assert.equal(calls, 1);
  }
});

test("stream bounds count the full observed crossing chunk, not only accepted bytes", async () => {
  const result = await fetchImage(plan()[0], async () => response(jpeg()), 3);
  assert.deepEqual(result, { status: "failed", reason: "response_bound", bytesReceived: 4 });
});

test("partial stream failure preserves observed bytes and strips private error diagnostics", async () => {
  let pulls = 0;
  const body = new ReadableStream(
    {
      pull(controller) {
        if (pulls++ === 0) controller.enqueue(jpeg());
        else controller.error(new Error("private path / secret transport"));
      },
    },
    { highWaterMark: 0 },
  );
  const result = await fetchImage(
    plan()[0],
    async () => new Response(body, { headers: { "content-type": "image/jpeg" } }),
    budget,
  );
  assert.deepEqual(result, { status: "failed", reason: "network_error", bytesReceived: 4 });
  assert.doesNotMatch(JSON.stringify(result), /private|secret|transport/u);
});

test("failed headers cancel the body before any reads and no transport retry occurs", async () => {
  let reads = 0,
    cancelled = 0,
    calls = 0;
  const body = new ReadableStream(
    {
      pull() {
        reads++;
      },
      cancel() {
        cancelled++;
      },
    },
    { highWaterMark: 0 },
  );
  const result = await fetchImage(
    plan()[0],
    async () => {
      calls++;
      return new Response(body, { headers: { "content-type": "text/html" } });
    },
    budget,
  );
  assert.equal(result.status, "failed");
  assert.equal(reads, 0);
  assert.equal(cancelled, 1);
  assert.equal(calls, 1);
});

test("review HTML/forms do not expose GTIN, source-label keys, answers or keyed attribution links", () => {
  const rows = plan().map((row) => ({
    ...row,
    status: "ready",
    width: 400,
    height: 300,
    reviewImageSha256: "a".repeat(64),
  }));
  const html = renderBlindPage(rows),
    form = blankReview(rows, "b".repeat(64)),
    json = JSON.stringify(form);
  for (const row of rows) {
    for (const sensitive of [
      row.gtin,
      row.sourceReportedName,
      row.sourceReportedQuantity,
      row.productId,
      row.imageUrl,
      row.productSourceUrl,
    ]) {
      assert.ok(!html.includes(sensitive));
      assert.ok(!json.includes(sensitive));
    }
  }
  assert.doesNotMatch(html, /ATTRIBUTION|\.\.\/|https?:|<script|localStorage|fetch\(/u);
  assert.match(html, /ei hyväksytty jaettavaksi/u);
  assert.match(html, /CREDITS\.md/u);
  assert.match(html, /<html lang="fi">/u);
  assert.match(html, /Content-Security-Policy/u);
  assert.equal(form.reviewerId, "");
  assert.equal(form.reviewedOn, "");
  assert.equal(form.status, "unreviewed");
  for (const row of form.cases) {
    for (const name of ["observedName", "observedSize", "observedGtin", "duplicateGroup", "notes"])
      assert.equal(row[name], "");
    for (const name of ["identityAssessment", "privacyAssessment", "imageSuitability"])
      assert.equal(row[name], "unreviewed");
  }
});

test("review failure remains visible, untrusted text is escaped and attributes are bounded", () => {
  const html = renderBlindPage([
    { blindId: "case-001", status: "failed", reason: '<script>alert("x")</script>' },
  ]);
  assert.doesNotMatch(html, /<script>/u);
  assert.match(html, /&lt;script&gt;/u);
  assert.throws(() => renderBlindPage([{ blindId: 'x" onerror="bad', status: "failed" }]));
  assert.throws(() =>
    renderBlindPage([
      { blindId: "case-001", status: "ready", width: '1" onerror="bad', height: 400 },
    ]),
  );
  assert.throws(() => blankReview([], "not-a-hash"));
});

test("exclusive bounded writes reject existing files, links, linked parents and paths outside work", () => {
  const cwd = temporaryWorkspace(),
    valid = path.join(cwd, "work/valid.bin");
  writeBytes(valid, jpeg(), 4, cwd);
  assert.deepEqual(new Uint8Array(fs.readFileSync(valid)), jpeg());
  assert.equal(fs.statSync(valid).mode & 0o777, 0o600);
  assert.throws(() => writeBytes(valid, jpeg(), 4, cwd));
  assert.throws(() => writeBytes(path.join(cwd, "outside.bin"), jpeg(), 4, cwd));
  assert.throws(() => writeBytes(path.join(cwd, "work/oversized.bin"), jpeg(), 3, cwd));
  fs.symlinkSync(valid, path.join(cwd, "work/linked.bin"));
  assert.throws(() => writeBytes(path.join(cwd, "work/linked.bin"), jpeg(), 4, cwd));
  fs.mkdirSync(path.join(cwd, "real"));
  fs.symlinkSync(path.join(cwd, "real"), path.join(cwd, "work/linked-parent"));
  assert.throws(() => writeBytes(path.join(cwd, "work/linked-parent/new.bin"), jpeg(), 4, cwd));
  assert.equal(fs.readdirSync(path.join(cwd, "real")).length, 0);
});

test("CLI orchestration rejects bad hash/path before decoder or network, without existing outputs", async () => {
  const cwd = temporaryWorkspace();
  let calls = 0;
  assert.throws(() => freezeAcquisition(path.join(cwd, "outside"), cwd), /outside_work/u);
  await assert.rejects(
    acquireReferences("work/missing", "bad", "work/new", {
      cwd,
      fetcher: async () => {
        calls++;
        throw new Error("not allowed");
      },
    }),
    /lock_hash_required/u,
  );
  assert.equal(calls, 0);
  assert.equal(fs.readdirSync(path.join(cwd, "work")).length, 0);
});

test("orchestration reserves the one-shot ledger and each dispatch before network, then preserves download evidence before disk processing", () => {
  // Structural ordering guard, not a substitute for the separately recorded
  // real21-request receipt recount and actual repeat-refusal observation.
  const source = fs.readFileSync(
    new URL("../qa/reference-image/acquire-off-references.mjs", import.meta.url),
    "utf8",
  );
  const ledger = source.search(/writeJsonExclusive\(\s*marker,/u);
  const dispatch = source.search(/`\$\{entry\.blindId\}-dispatch\.json`/u);
  const request = source.indexOf("const fetched = await fetchImage(");
  const download = source.search(/`\$\{entry\.blindId\}-download\.json`/u);
  const original = source.indexOf("path.join(output, row.originalFile),");
  assert.ok(
    ledger >= 0 &&
      ledger < dispatch &&
      dispatch < request &&
      request < download &&
      download < original,
  );
  assert.ok(source.indexOf("checkedOutput(ledger, cwd)") < ledger);
  assert.ok(source.includes("integrationAllowed: false"));
});
