import assert from "node:assert/strict";
import test from "node:test";
import { crc32 } from "node:zlib";
import {
  checkedSourceUrl,
  commonsRecord,
  aggregateLineage,
  sourceTitles,
  stripPngMetadata,
} from "../qa/object-development-import.mjs";
const chunk = (type, data = Buffer.alloc(0)) => {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  out.write(type, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, out.length - 4)), out.length - 4);
  return out;
};
const png = (...extra) =>
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.alloc(13)),
    ...extra,
    chunk("IDAT", Buffer.from("synthetic-chunk-unit-test-only")),
    chunk("IEND"),
  ]);
test("PNG metadata stripped without changing image data chunks", () => {
  const clean = png(chunk("sRGB", Buffer.from([0])));
  const dirty = png(
    chunk("sRGB", Buffer.from([0])),
    chunk("eXIf", Buffer.from("private-metadata")),
    chunk("tEXt", Buffer.from("private-text")),
  );
  assert.deepEqual(stripPngMetadata(dirty), clean);
  assert(!stripPngMetadata(dirty).includes(Buffer.from("private")));
});
test("bad PNG CRC, truncation and unknown critical chunks fail closed", () => {
  const bad = png();
  bad[40] ^= 1;
  for (const bytes of [bad, png().subarray(0, 20), png(chunk("EVIL")), Buffer.from("not-png")])
    assert.throws(() => stripPngMetadata(bytes));
});
const digest = (c) => c.repeat(64);
const row = (id, split = "train") => ({
  id,
  file: `${id}.png`,
  sha256: digest("a"),
  pool: "development",
  split,
  objectId: id,
  sourceFamily: id,
  origin: "source",
  parentId: null,
  evidenceFile: "source.json",
  evidenceSha256: digest("b"),
});
const manifest = (...images) => ({ schemaVersion: "object-image-audit-v1", images });
const report = (...rows) => ({
  schemaVersion: "object-image-audit-result-v1",
  receipts: rows.map((r) => ({
    id: r.id,
    imageSha256: r.sha256,
    evidenceSha256: r.evidenceSha256,
    pixelSha256: digest("c"),
    perceptualHash: "0000000000000000",
    metadataPresent: false,
  })),
});
const metadata = (license = "CC BY-SA 3.0") => ({
  query: {
    pages: {
      1: {
        pageid: 1,
        title: "File:Test.jpg",
        imageinfo: [
          {
            url: "https://upload.wikimedia.org/test.jpg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Test.jpg",
            extmetadata: {
              Artist: { value: "Synthetic unit-test author" },
              LicenseShortName: { value: license },
              LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/3.0/" },
            },
          },
        ],
      },
    },
  },
});
test("fixed bounded source list and accepted licence retain source-only status", () => {
  assert.equal(sourceTitles.length, 5);
  const r = commonsRecord(metadata());
  assert.equal(r.materialTruth, "unknown");
  assert.equal(r.independence, "unverified-web-source-development-only");
});
for (const url of [
  "http://upload.wikimedia.org/x",
  "https://evil.example/x",
  "https://upload.wikimedia.org.evil.example/x",
  "https://a@upload.wikimedia.org/x",
  "https://upload.wikimedia.org:8443/x",
])
  test(`rejects source ${url}`, () => assert.throws(() => checkedSourceUrl(url)));
for (const license of ["CC BY-NC-SA 4.0", "All rights reserved", "GFDL", undefined])
  test(`rejects unapproved licence ${license}`, () => {
    const m = metadata(license);
    if (license === undefined) delete m.query.pages["1"].imageinfo[0].extmetadata.LicenseShortName;
    assert.throws(() => commonsRecord(m));
  });
test("missing credit cannot pass reuse check", () => {
  const m = metadata();
  delete m.query.pages["1"].imageinfo[0].extmetadata.Artist;
  assert.throws(() => commonsRecord(m), /source_credit_missing/);
});
test("global duplicate pixels/bytes crossing batch splits are detected", () => {
  const a = row("one"),
    b = row("two", "test");
  const r = aggregateLineage([manifest(a), manifest(b)], [report(a), report(b)]);
  assert(r.findings.some((f) => f.kind === "global_cross_split_bytes"));
  assert(r.findings.some((f) => f.kind === "global_cross_split_pixels"));
  assert.equal(r.nearReview.length, 1);
  assert.equal(r.inferenceReady, false);
});
test("cross-batch source family leakage remains visible", () => {
  const a = row("one"),
    b = { ...row("two", "test"), sourceFamily: a.sourceFamily };
  const r = aggregateLineage([manifest(a), manifest(b)], [report(a), report(b)]);
  assert(r.findings.some((f) => f.kind === "global_cross_split_family"));
});
test("derived parent is resolved globally, never converted to a new capture", () => {
  const a = row("one"),
    b = { ...a, id: "one-clean", origin: "derived", parentId: a.id };
  const r = aggregateLineage([manifest(a), manifest(b)], [report(a), report(b)]);
  assert.equal(r.images, 2);
  assert.equal(r.pairsChecked, 0);
  assert.equal(r.inferenceReady, false);
});
test("missing parent and duplicate global IDs are rejected", () => {
  const a = row("one");
  assert.throws(
    () =>
      aggregateLineage([manifest({ ...a, origin: "derived", parentId: "missing" })], [report(a)]),
    /missing_parent/,
  );
  assert.throws(
    () => aggregateLineage([manifest(a), manifest(a)], [report(a), report(a)]),
    /duplicate_id/,
  );
});
test("receipt hash tampering and missing receipt not green", () => {
  const a = row("one"),
    bad = report(a);
  bad.receipts[0].imageSha256 = digest("d");
  assert.throws(() => aggregateLineage([manifest(a)], [bad]), /receipt_join/);
  assert(
    aggregateLineage([manifest(a)], [report()]).findings.some(
      (f) => f.kind === "missing_global_receipt",
    ),
  );
});
