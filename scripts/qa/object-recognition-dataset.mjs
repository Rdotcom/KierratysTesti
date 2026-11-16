// QA preparation only. No model, network, image capture or app imports.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const classes = Object.freeze([
  "cup",
  "spoon",
  "cutlery",
  "dish",
  "bottle",
  "jar",
  "can",
  "carton",
  "bag-wrapper",
  "battery",
  "small-electronics",
  "textile",
]);
export const deviceTiers = Object.freeze([
  "iphone-older",
  "iphone-newer",
  "samsung-a",
  "samsung-s",
]);
export const protocol = Object.freeze({
  version: "object-recognition-pilot-v1",
  precision: 0.99,
  unknownFalseAcceptance: 0.01,
  coverage: 0.7,
  minimumCoverageGain: 0.1,
  maximumModelCandidates: 2,
  warmP95Ms: 3000,
  coldP95Ms: 5000,
  extraMemoryMiB: 250,
  resourcesMiB: 150,
});
const keys = (o, expected) => {
  assert(o && typeof o === "object" && !Array.isArray(o), "invalid_object");
  assert.deepEqual(Object.keys(o).sort(), [...expected].sort(), "unexpected_fields");
};
const id = (s) =>
  assert(typeof s === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(s), "invalid_id");
const hash = (s) => assert(typeof s === "string" && /^[a-f0-9]{64}$/.test(s), "invalid_hash");
const text = (s) =>
  assert(
    typeof s === "string" && s.trim() === s && s.length > 0 && s.length <= 300,
    "invalid_text",
  );

/** Validates declared metadata only. It cannot certify material truth or image bytes. */
export function auditDataset(manifest) {
  keys(manifest, ["schemaVersion", "samples"]);
  assert.equal(manifest.schemaVersion, protocol.version, "protocol_mismatch");
  assert(Array.isArray(manifest.samples) && manifest.samples.length <= 50000, "invalid_samples");
  const ids = new Set(),
    hashes = new Set(),
    groups = new Map(),
    objects = new Map();
  const coverage = Object.fromEntries(
    classes.map((c) => [c, { train: 0, calibration: 0, test: 0 }]),
  );
  const missing = [];
  let unresolvedMaterials = 0;
  for (const row of manifest.samples) {
    keys(row, [
      "id",
      "objectId",
      "sessionId",
      "sourceFamily",
      "split",
      "role",
      "classId",
      "sha256",
      "deviceTier",
      "deviceModel",
      "osVersion",
      "condition",
      "textVisible",
      "classEvidence",
      "material",
      "rights",
      "privacyChecked",
    ]);
    for (const field of ["id", "objectId", "sessionId", "sourceFamily"]) id(row[field]);
    hash(row.sha256);
    assert(!ids.has(row.id), "duplicate_id");
    ids.add(row.id);
    assert(!hashes.has(row.sha256), "duplicate_image_bytes");
    hashes.add(row.sha256);
    assert(["train", "calibration", "test"].includes(row.split), "invalid_split");
    assert(["known", "unknown", "risk"].includes(row.role), "invalid_role");
    assert(row.classId === null || classes.includes(row.classId), "invalid_class");
    assert(row.role !== "known" || row.classId !== null, "missing_known_class");
    assert(row.role !== "unknown" || row.classId === null, "unknown_has_known_class");
    assert(row.role !== "unknown" || row.split !== "train", "unknown_in_training");
    assert(row.role !== "risk" || row.split === "test", "risk_not_heldout");
    assert(deviceTiers.includes(row.deviceTier), "invalid_device_tier");
    for (const field of ["deviceModel", "osVersion", "condition"]) text(row[field]);
    assert(typeof row.textVisible === "boolean", "missing_text_visibility");
    assert.equal(row.privacyChecked, true, "privacy_unchecked");
    keys(row.rights, ["license", "reference"]);
    text(row.rights.license);
    text(row.rights.reference);
    keys(row.classEvidence, ["kind", "reference"]);
    assert(
      ["physical-observation", "manufacturer-record"].includes(row.classEvidence.kind),
      "unsupported_class_truth",
    );
    text(row.classEvidence.reference);
    keys(row.material, ["value", "status", "reference"]);
    if (row.material.status === "unknown") {
      assert.equal(row.material.value, null, "unknown_material_value");
      assert.equal(row.material.reference, null, "unknown_material_reference");
      unresolvedMaterials++;
    } else {
      assert(
        ["manufacturer-record", "physical-marking"].includes(row.material.status),
        "unsupported_material_truth",
      );
      id(row.material.value);
      text(row.material.reference);
    }
    // Group constraints include source/capture lineage, not just exact duplicates.
    for (const field of ["objectId", "sessionId", "sourceFamily"]) {
      const key = `${field}:${row[field]}`;
      assert(!groups.has(key) || groups.get(key) === row.split, "cross_split_leakage");
      groups.set(key, row.split);
    }
    const signature = JSON.stringify([
      row.split,
      row.role,
      row.classId,
      row.classEvidence,
      row.material,
    ]);
    let object = objects.get(row.objectId);
    assert(!object || object.signature === signature, "conflicting_object_truth");
    if (!object) {
      object = {
        signature,
        split: row.split,
        role: row.role,
        classId: row.classId,
        views: new Map(),
        textFree: false,
      };
      objects.set(row.objectId, object);
      if (row.role === "known") coverage[row.classId][row.split]++;
    }
    object.views.set(row.deviceTier, (object.views.get(row.deviceTier) ?? 0) + 1);
    if (!row.textVisible) object.textFree = true;
  }
  for (const c of classes)
    for (const [split, count] of Object.entries({ train: 30, calibration: 10, test: 10 })) {
      if (coverage[c][split] < count)
        missing.push(`${c}:${split}:${count - coverage[c][split]}-objects`);
    }
  for (const [role, split, minimum] of [
    ["unknown", "calibration", 100],
    ["unknown", "test", 100],
    ["risk", "test", 100],
  ]) {
    const count = [...objects.values()].filter((o) => o.role === role && o.split === split).length;
    if (count < minimum) missing.push(`${role}:${split}:${minimum - count}-objects`);
  }
  let incompleteDeviceObjects = 0;
  for (const object of objects.values()) {
    if (deviceTiers.some((d) => (object.views.get(d) ?? 0) < 3)) incompleteDeviceObjects++;
  }
  if (incompleteDeviceObjects)
    missing.push(`incomplete-device-views:${incompleteDeviceObjects}-objects`);
  for (const c of ["cup", "spoon", "cutlery", "dish"]) {
    const count = [...objects.values()].filter(
      (o) => o.role === "known" && o.split === "test" && o.classId === c && o.textFree,
    ).length;
    if (count < 10) missing.push(`text-free-test:${c}:${10 - count}-objects`);
  }
  return {
    protocol: protocol.version,
    metadataValid: true,
    declaredSamples: manifest.samples.length,
    distinctObjects: objects.size,
    unresolvedMaterialRows: unresolvedMaterials,
    coverage,
    missing,
    collectionMetadataComplete: missing.length === 0,
    inferenceReady: false,
    releaseReady: false,
    limitation:
      "Metadata assertions only: image bytes, rights, label truth, capture independence, model pins and frozen evaluation receipts still require verification.",
  };
}

export function readDataset(filename) {
  const stat = fs.lstatSync(filename);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16 * 1024 * 1024,
    "unsafe_manifest",
  );
  const bytes = fs.readFileSync(filename);
  assert(bytes.length <= 16 * 1024 * 1024, "oversized_manifest");
  return {
    manifestSha256: createHash("sha256").update(bytes).digest("hex"),
    ...auditDataset(JSON.parse(bytes.toString("utf8"))),
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert(
      process.argv.length === 3,
      "usage: node scripts/qa/object-recognition-dataset.mjs MANIFEST.json",
    );
    const result = readDataset(process.argv[2]);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.collectionMetadataComplete ? 0 : 2;
  } catch {
    // Never echo untrusted manifest values or filesystem contents into logs.
    process.stderr.write(
      "Dataset metadata rejected; check schema, lineage, truth and rights fields.\n",
    );
    process.exitCode = 1;
  }
}
