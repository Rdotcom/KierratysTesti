import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  auditDataset,
  classes,
  deviceTiers,
  protocol,
  readDataset,
} from "../qa/object-recognition-dataset.mjs";

// Synthetic metadata for validator tests only; never recognition evidence.
const row = (suffix = "one") => ({
  id: `image-${suffix}`,
  objectId: `object-${suffix}`,
  sessionId: `session-${suffix}`,
  sourceFamily: `source-${suffix}`,
  split: "train",
  role: "known",
  classId: "cup",
  sha256: createHash("sha256").update(suffix).digest("hex"),
  deviceTier: "iphone-older",
  deviceModel: "synthetic-test-device",
  osVersion: "synthetic-test-os",
  condition: "test-only",
  textVisible: false,
  classEvidence: { kind: "physical-observation", reference: "synthetic-unit-test-only" },
  material: { value: null, status: "unknown", reference: null },
  rights: { license: "test-fixture-only", reference: "synthetic-unit-test-only" },
  privacyChecked: true,
});
const manifest = (...samples) => ({ schemaVersion: protocol.version, samples });
test("empty real manifest is honest missing data, never a quality pass", () => {
  const result = readDataset(
    new URL("../qa/local-vision/object-recognition-pilot-manifest.json", import.meta.url),
  );
  assert.equal(result.declaredSamples, 0);
  assert.equal(result.inferenceReady, false);
  assert.equal(result.collectionMetadataComplete, false);
  assert.equal(result.missing.length, 43);
});
test("known class with unknown material is valid without inventing material", () => {
  const report = auditDataset(manifest(row()));
  assert.equal(report.unresolvedMaterialRows, 1);
  assert.equal(report.coverage.cup.train, 1);
  assert.equal(report.releaseReady, false);
});
for (const field of ["objectId", "sessionId", "sourceFamily"]) {
  test(`blocks cross-split ${field} leakage`, () => {
    const a = row(),
      b = { ...row("two"), split: "test", [field]: a[field] };
    assert.throws(() => auditDataset(manifest(a, b)), /cross_split_leakage/);
  });
}
test("duplicate bytes and IDs are rejected", () => {
  assert.throws(() => auditDataset(manifest(row(), row())), /duplicate_id/);
  assert.throws(
    () => auditDataset(manifest(row(), { ...row("two"), sha256: row().sha256 })),
    /duplicate_image_bytes/,
  );
});
test("contradictory material for same object is rejected", () => {
  const a = row(),
    b = {
      ...row("two"),
      objectId: a.objectId,
      material: { value: "plastic", status: "physical-marking", reference: "test" },
    };
  assert.throws(() => auditDataset(manifest(a, b)), /conflicting_object_truth/);
});
for (const change of [
  { classEvidence: { kind: "ai-inferred", reference: "test" } },
  { material: { value: "ceramic", status: "ai-inferred", reference: "test" } },
  { material: { value: "ceramic", status: "unknown", reference: null } },
  { privacyChecked: false },
  { rights: { license: "", reference: "test" } },
  { classId: "unregistered" },
  { textVisible: null },
  { sha256: "not-a-hash" },
  { role: "unknown" },
  { role: "risk" },
  { privatePhoto: "forbidden-extra-field" },
])
  test(`rejects invalid metadata ${JSON.stringify(change)}`, () => {
    assert.throws(() => auditDataset(manifest({ ...row(), ...change })));
  });
test("captures do not inflate independent object count", () => {
  const a = row(),
    b = { ...row("two"), objectId: a.objectId };
  const report = auditDataset(manifest(a, b));
  assert.equal(report.declaredSamples, 2);
  assert.equal(report.distinctObjects, 1);
  assert.equal(report.coverage.cup.train, 1);
});
test("unknown material remains possible in outside-class held-out data", () => {
  const result = auditDataset(
    manifest({ ...row(), split: "test", role: "unknown", classId: null }),
  );
  assert.equal(result.metadataValid, true);
});
test("complete synthetic collection is still not inference or release readiness", () => {
  const rows = [];
  const add = (key, role, split, classId) => {
    for (const deviceTier of deviceTiers)
      for (let view = 0; view < 3; view++) {
        const r = row(`${key}-${deviceTier}-${view}`);
        rows.push({
          ...r,
          objectId: key,
          sessionId: key,
          sourceFamily: key,
          role,
          split,
          classId,
          deviceTier,
        });
      }
  };
  for (const c of classes)
    for (const [split, n] of [
      ["train", 30],
      ["calibration", 10],
      ["test", 10],
    ]) {
      for (let i = 0; i < n; i++) add(`${c}-${split}-${i}`, "known", split, c);
    }
  for (let i = 0; i < 100; i++) {
    add(`unknown-cal-${i}`, "unknown", "calibration", null);
    add(`unknown-test-${i}`, "unknown", "test", null);
    add(`risk-test-${i}`, "risk", "test", null);
  }
  const report = auditDataset(manifest(...rows));
  assert.equal(report.distinctObjects, 900);
  assert.equal(report.declaredSamples, 10800);
  assert.equal(report.collectionMetadataComplete, true);
  assert.equal(report.inferenceReady, false);
  assert.equal(report.releaseReady, false);
});
test("CLI signals missing data with exit 2 instead of green readiness", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/qa/object-recognition-dataset.mjs",
      "scripts/qa/local-vision/object-recognition-pilot-manifest.json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).inferenceReady, false);
});
