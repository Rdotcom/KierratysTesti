import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  auditImageFiles,
  confinedFile,
  validateFileManifest,
} from "../qa/object-recognition-files.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const manifest = (...images) => ({ schemaVersion: "object-image-audit-v1", images });
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kig-image-audit-")));
  t.after(() => fs.rmSync(root, { recursive: true }));
  fs.writeFileSync(path.join(root, "image.jpg"), "synthetic-not-a-real-image");
  fs.writeFileSync(path.join(root, "source.json"), "synthetic-evidence");
  const row = {
    id: "one",
    file: "image.jpg",
    sha256: sha("synthetic-not-a-real-image"),
    pool: "development",
    split: "train",
    objectId: "one",
    sourceFamily: "family-one",
    origin: "source",
    parentId: null,
    evidenceFile: "source.json",
    evidenceSha256: sha("synthetic-evidence"),
  };
  // Decoder stub is unit-test only, not an image-format or quality test.
  const decode = async () => ({
    width: 64,
    height: 64,
    pixelSha256: sha("pixels"),
    perceptualHash: "0000000000000000",
    metadataPresent: false,
  });
  return { root, row, decode };
}
test("bounded successful read binds image and evidence but never grants readiness", async (t) => {
  const { root, row, decode } = fixture(t);
  const r = await auditImageFiles(root, manifest(row), decode);
  assert.equal(r.decodedImages, 1);
  assert.equal(r.byteAuditClean, true);
  assert.equal(r.physicalDeclaredImages, 0);
  assert.equal(r.inferenceReady, false);
});
test("empty audit is incomplete, not clean", async (t) => {
  const { root, decode } = fixture(t);
  assert.equal((await auditImageFiles(root, manifest(), decode)).byteAuditClean, false);
});
for (const file of [
  "../image.jpg",
  "/etc/passwd",
  "./image.jpg",
  "a//b",
  "file:x",
  "a\\b",
  "a\nb",
]) {
  test(`rejects unsafe path ${JSON.stringify(file)}`, (t) => {
    const { root } = fixture(t);
    assert.throws(() => confinedFile(root, file));
  });
}
test("symlinks including directory links cannot escape confinement", (t) => {
  const { root } = fixture(t);
  fs.symlinkSync(path.join(root, "image.jpg"), path.join(root, "link.jpg"));
  fs.symlinkSync(root, path.join(root, "alias"));
  assert.throws(() => confinedFile(root, "link.jpg"), /linked_file/);
  assert.throws(() => confinedFile(root, "alias/image.jpg"), /linked_file/);
});
test("hardlinks rejected and failed rows retained without decoder execution", async (t) => {
  const { root, row } = fixture(t);
  fs.linkSync(path.join(root, "image.jpg"), path.join(root, "hard.jpg"));
  const r = await auditImageFiles(root, manifest(row), () => {
    throw Error("must not run");
  });
  assert.equal(r.decodedImages, 0);
  assert.equal(r.findings[0].kind, "unverified_image_or_evidence");
});
for (const key of ["sha256", "evidenceSha256"])
  test(`rejects changed ${key} before decode`, async (t) => {
    const { root, row } = fixture(t);
    let calls = 0;
    const r = await auditImageFiles(root, manifest({ ...row, [key]: "0".repeat(64) }), () => {
      calls++;
    });
    assert.equal(calls, 0);
    assert.equal(r.findings.length, 1);
    assert.equal(r.byteAuditClean, false);
  });
test("metadata is flagged without exposing its contents", async (t) => {
  const { root, row, decode } = fixture(t);
  const r = await auditImageFiles(root, manifest(row), async () => ({
    ...(await decode()),
    metadataPresent: true,
  }));
  assert.equal(r.findings[0].kind, "embedded_metadata");
  assert.equal(r.byteAuditClean, false);
});
test("source/generated material cannot masquerade as a physical pilot", (t) => {
  const { row } = fixture(t);
  for (const origin of ["source", "generated"])
    assert.throws(
      () => validateFileManifest(manifest({ ...row, origin, pool: "physical-pilot" })),
      /source_as_physical/,
    );
});
test("missing parent, cycle and derived split changes are rejected", (t) => {
  const { row } = fixture(t);
  assert.throws(
    () => validateFileManifest(manifest({ ...row, origin: "derived", parentId: "missing" })),
    /missing_parent/,
  );
  assert.throws(
    () => validateFileManifest(manifest({ ...row, origin: "derived", parentId: "one" })),
    /lineage_cycle/,
  );
  assert.throws(
    () =>
      validateFileManifest(
        manifest(row, { ...row, id: "two", origin: "derived", parentId: "one", split: "test" }),
      ),
    /derived_lineage_leakage/,
  );
});
test("different compressed bytes with same pixels count as duplicates", async (t) => {
  const { root, row, decode } = fixture(t);
  fs.writeFileSync(path.join(root, "other.jpg"), "different-encoding");
  const other = {
    ...row,
    id: "two",
    objectId: "two",
    sourceFamily: "family-two",
    split: "test",
    file: "other.jpg",
    sha256: sha("different-encoding"),
  };
  const r = await auditImageFiles(root, manifest(row, other), decode);
  assert.equal(r.findings[0].kind, "duplicate_bytes_or_pixels");
  assert.equal(r.findings[0].crossSplit, true);
});
test("near-duplicate flag is review only; source lineage crossing split is high", async (t) => {
  const { root, row, decode } = fixture(t);
  fs.writeFileSync(path.join(root, "other.jpg"), "another-encoding");
  let count = 0;
  const r = await auditImageFiles(
    root,
    manifest(row, {
      ...row,
      id: "two",
      objectId: "two",
      split: "test",
      file: "other.jpg",
      sha256: sha("another-encoding"),
    }),
    async () => ({
      ...(await decode()),
      pixelSha256: sha(String(++count)),
      perceptualHash: count === 1 ? "0000000000000000" : "0000000000000001",
    }),
  );
  assert(r.findings.some((f) => f.kind === "near_duplicate_review" && f.severity === "high"));
  assert(r.findings.some((f) => f.kind === "cross_split_sourceFamily"));
  assert.equal(r.inferenceReady, false);
});
test("decode failures are retained and raw exception messages not leaked", async (t) => {
  const { root, row } = fixture(t);
  const r = await auditImageFiles(root, manifest(row), () => {
    throw Error("private-exif-person-name");
  });
  assert.equal(r.declaredImages, 1);
  assert.equal(r.decodedImages, 0);
  assert(!JSON.stringify(r).includes("private-exif"));
});
