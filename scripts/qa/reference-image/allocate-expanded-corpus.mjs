// Explicit pre-recognition allocation. Does not alter any earlier corpus/metric.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkedOutput,
  checkedWorkFile,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import { loadPinnedReferenceDecoder } from "./pinned-reference-decoder.mjs";

const rootDefault = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const pins = {
  "work/native-corpus-2026-11-14.pmUx6s/freeze/lock.json":
    "0fcf92e80595adc08d846b26c5b1b0b31de6c7bdd45318344ed3d2f91d4224ee",
  "work/native-corpus-2026-11-14.pmUx6s/result/summary.json":
    "dba2524158bea689f6fce1dbb6e776d04a294dea5a0d0ec27d9877a6ec4bc431",
  "work/off-expansion-2026-11-14.KK6s7m/plan-v2/plan.json":
    "7618f1876275d01aeb80a5401dea0bf903021cd28027358f9136fae84eebb86f",
  "work/off-expansion-2026-11-14.KK6s7m/images/summary.json":
    "defc205b180a0997961c818dcbfcd1d3fde6513aa34dde1b1738d6c021dbc798",
  "docs/final/OFF_EXPANSION_VISUAL_REVIEW.json":
    "bd720f0383f1b8ac6832ea60d4140e45afd0987c93280197223e6de9aa048014",
};
const ledger = "work/expanded-corpus-allocation-v1-attempt.json";
export const EXPANDED_ALLOCATION = Object.freeze([
  { productId: "off-3017620422003", references: ["case-004", "exp-006"], pilotQuery: "exp-003" },
  { productId: "off-4008400404127", references: ["case-001", "case-019"], pilotQuery: "exp-009" },
  { productId: "off-5449000000996", references: ["exp-017", "exp-018"], pilotQuery: "case-008" },
  { productId: "off-8076800195057", references: ["case-012", "case-020"], pilotQuery: "exp-021" },
  { productId: "off-7622210449283", references: ["case-009", "case-015"], pilotQuery: "exp-026" },
]);

export function validateExpandedAllocation(rows, pilot, originalQueries) {
  assert.equal(rows.length, 123, "complete_inventory");
  assert.equal(new Set(rows.map((r) => r.id)).size, 123);
  assert.equal(pilot.length, 5);
  assert.equal(new Set(pilot.map((p) => p.productId)).size, 5);
  const refs = rows.filter((r) => r.allocationRole === "reference"),
    fit = rows.filter((r) => ["reference", "calibration_negative"].includes(r.allocationRole));
  const queries = rows.filter((r) => ["product_query", "safety_audit"].includes(r.allocationRole));
  assert.equal(refs.length, 10);
  assert.equal(fit.length, 42);
  assert.equal(queries.length, 58);
  assert.equal(rows.filter((r) => r.allocationRole === "product_query").length, 17);
  assert.equal(rows.filter((r) => r.allocationRole === "safety_audit").length, 41);
  const fitFamilies = new Set(fit.map((r) => r.familyId));
  assert.ok(
    queries.every((r) => !fitFamilies.has(r.familyId)),
    "fit_query_family_leakage",
  );
  const fitIds = new Set(fit.map((r) => r.id)),
    fitHashes = new Set(fit.map((r) => r.imageSha256));
  for (const row of [...fit, ...queries]) {
    assert.match(row.imageSha256 ?? "", /^[a-f0-9]{64}$/u);
    assert.ok(typeof row.familyId === "string" && row.familyId.length > 0);
    assert.equal(row.source?.reviewStatus, "source_asserted_pending_review");
  }
  assert.ok(
    originalQueries.every((r) => !fitIds.has(r.id) && !fitHashes.has(r.imageSha256)),
    "original_query_training_leakage",
  );
  assert.ok(
    queries.every((r) => !fitHashes.has(r.imageSha256)),
    "exact_byte_leakage",
  );
  for (const p of pilot) {
    const r = refs.filter((r) => r.productId === p.productId),
      q = queries.find((r) => r.id === p.pilotQuery);
    assert.equal(r.length, 2);
    assert.equal(new Set(r.map((r) => r.familyId)).size, 2, "shared_reference_batch");
    assert.deepEqual(
      r.map((r) => r.id).sort(),
      [...p.references].sort(),
      "unregistered_reference_substitution",
    );
    assert.ok(q && q.productId === p.productId && q.allocationRole === "product_query");
    assert.ok(!r.some((r) => r.familyId === q.familyId), "pilot_family_leakage");
  }
  assert.ok(
    fit.every((r) => r.status !== "failed" && r.view !== "label_crop" && r.view !== "mixed_scene"),
    "ineligible_fit_image",
  );
  assert.ok(
    rows
      .filter((r) => r.originalRole === "calibration_only" && r.controlKind === "mixed_scene")
      .every((r) => r.allocationRole === "safety_audit"),
    "mixed_fit_negative",
  );
  assert.equal(
    rows.find((r) => r.id === "case-007").allocationRole,
    "excluded_shared_reference_batch",
  );
  assert.equal(
    rows.find((r) => r.id === "case-008").evaluationNovelty,
    "seen_sentinel_new_catalogue_membership",
  );
  return {
    products: 5,
    references: 10,
    calibrationNegatives: 32,
    productQueries: 17,
    safetyAudits: 41,
    pilotQueries: 5,
    newPilotImages: 4,
    seenPilotImages: 1,
    totalQueries: 58,
    inventory: 123,
    integrationAllowed: false,
  };
}

export async function freezeExpandedAllocation(outputArgument, root = rootDefault) {
  assert.ok(!fs.existsSync(path.join(root, ledger)), "expanded_allocation_already_attempted");
  const output = checkedOutput(outputArgument, root),
    dataPins = { ...pins };
  const readPin = (file) => {
    const b = readBounded(path.join(root, file), 4_000_000);
    assert.equal(sha(b), pins[file]);
    return JSON.parse(b);
  };
  const [legacyFile, resultFile, planFile, acquiredFile, reviewFile] = Object.keys(pins);
  const legacy = readPin(legacyFile),
    oldResult = readPin(resultFile),
    plan = readPin(planFile),
    acquired = readPin(acquiredFile),
    review = readPin(reviewFile);
  const rows = legacy.rows.map((r) => {
    if (!r.productId)
      return {
        ...r,
        originalRole: r.role,
        familyId: `commons:${r.sourceFamily}`,
        allocationRole:
          r.role === "calibration_only" && r.controlKind !== "mixed_scene"
            ? "calibration_negative"
            : "safety_audit",
        status: "legacy_source_asserted",
      };
    const product = plan.products.find((p) => p.productId === r.productId),
      upload = r.sourceMetadata.originalId;
    const family = product.families.find((f) => f.originalIds.includes(upload));
    assert.ok(family, "missing_legacy_batch");
    return {
      ...r,
      originalRole: r.role,
      familyId: family.familyId,
      allocationRole:
        r.id === "case-007"
          ? "excluded_shared_reference_batch"
          : r.role === "reference"
            ? "reference"
            : "product_query",
      status: "legacy_source_asserted",
      view:
        r.id === "case-015"
          ? "legacy_partial_front_reference"
          : "legacy_reference_or_query_unverified_capture",
      evaluationNovelty:
        r.id === "case-008" ? "seen_sentinel_new_catalogue_membership" : "seen_legacy_development",
    };
  });
  for (const r of acquired.rows) {
    const observation = review.observations.find((x) => x.id === r.id);
    assert.ok(observation);
    let role = "unallocated_candidate";
    if (EXPANDED_ALLOCATION.some((p) => p.references.includes(r.id))) role = "reference";
    else if (EXPANDED_ALLOCATION.some((p) => p.pilotQuery === r.id)) role = "product_query";
    else if (r.id === "exp-016") role = "safety_audit";
    rows.push({
      ...r,
      originalRole: r.proposedRole,
      allocationRole: role,
      view: observation.view,
      visualNote: observation.note,
      ...(r.originalFile ? { file: r.originalFile, imageSha256: r.originalSha256 } : {}),
      evaluationNovelty: "new_image_selected_before_recognition",
      source: {
        publisher: `Open Food Facts / ${r.authorCredit}`,
        url: r.imageUrl,
        licence: "CC-BY-SA-3.0 images; ODbL/DbCL product metadata",
        checkedOn: r.sourceAccessedOn,
        snapshotSha256: r.sourceSnapshotSha256,
        reviewStatus: "source_asserted_pending_review",
      },
    });
  }
  const oldQueries = legacy.rows.filter((r) => !["reference", "calibration_only"].includes(r.role));
  const counts = validateExpandedAllocation(rows, EXPANDED_ALLOCATION, oldQueries);
  const selected = rows.filter((r) =>
    ["reference", "calibration_negative", "product_query", "safety_audit"].includes(
      r.allocationRole,
    ),
  );
  for (const r of selected) {
    const b = readBounded(checkedWorkFile(r.file, root), 1_500_000);
    assert.equal(sha(b), r.imageSha256);
    dataPins[r.file] = r.imageSha256;
  }
  const sourceFiles = [
    "scripts/qa/reference-image/allocate-expanded-corpus.mjs",
    "scripts/__tests__/expanded-allocation.test.mjs",
    "docs/final/EXPANDED_ALLOCATION_PROTOCOL.md",
  ];
  const sources = Object.fromEntries(
    sourceFiles.map((f) => [f, sha(readBounded(path.join(root, f), 2_000_000))]),
  );
  const decoder = loadPinnedReferenceDecoder(root);
  fs.mkdirSync(output, { mode: 0o700 });
  const protocol = writeJsonExclusive(
    path.join(output, "protocol.json"),
    {
      schemaVersion: "expanded-allocation-protocol-v1",
      sources,
      dataPins,
      selection: EXPANDED_ALLOCATION,
      counts,
      decoderLockSha256: decoder.lockSha256,
      originalQueryIds: oldQueries.map((r) => r.id),
      sourceAndCaptureStatus: "source_asserted_metadata_family_proxy_not_independent_accuracy",
      modelCalls: 0,
      integrationAllowed: false,
    },
    root,
  );
  writeJsonExclusive(
    path.join(root, ledger),
    { protocolSha256: protocol.sha256, output: path.relative(root, output) },
    root,
  );
  const profiles = [];
  for (const r of selected) {
    const b = readBounded(checkedWorkFile(r.file, root), 1_500_000);
    const raw = await decoder
      .sharp(b, { limitInputPixels: 16000000, failOn: "warning", animated: false })
      .rotate()
      .toColourspace("srgb")
      .flatten({ background: "#ffffff" })
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const hash = sha(
      Buffer.concat([
        Buffer.from(`${raw.info.width},${raw.info.height},${raw.info.channels}|`),
        raw.data,
      ]),
    );
    profiles.push({
      id: r.id,
      allocationRole: r.allocationRole,
      imageSha256: r.imageSha256,
      pixelSha256: hash,
      width: raw.info.width,
      height: raw.info.height,
    });
  }
  const pixelAliases = [];
  for (const a of profiles.filter((r) =>
    ["reference", "calibration_negative"].includes(r.allocationRole),
  ))
    for (const b of profiles.filter((r) =>
      ["product_query", "safety_audit"].includes(r.allocationRole),
    ))
      if (a.pixelSha256 === b.pixelSha256)
        pixelAliases.push({ fit: a.id, query: b.id, reason: "exact_canonical_pixel_alias" });
  for (const [file, digest] of Object.entries(sources))
    assert.equal(sha(readBounded(path.join(root, file), 2_000_000)), digest);
  for (const [file, digest] of Object.entries(dataPins))
    assert.equal(sha(readBounded(path.join(root, file), 4_000_000)), digest);
  loadPinnedReferenceDecoder(root);
  const saved = writeJsonExclusive(
    path.join(output, "allocation.json"),
    {
      schemaVersion: "expanded-allocation-v1",
      protocolSha256: protocol.sha256,
      status: pixelAliases.length
        ? "blocked_by_exact_pixel_alias"
        : "ready_for_frozen_recognition_protocol",
      counts,
      selection: EXPANDED_ALLOCATION,
      rows,
      profiles,
      pixelAliases,
      preservedBenchmark: {
        lock: legacyFile,
        lockSha256: pins[legacyFile],
        result: resultFile,
        resultSha256: pins[resultFile],
        previousAgreements: oldResult.rows
          .filter(
            (r) =>
              r.role === "product" &&
              r.result.status === "candidate" &&
              r.result.productIds[0] === r.productId,
          )
          .map((r) => r.id),
      },
      scopeChanges: [
        "Coca-Cola becomes enrolled: old case-008 sentinel is a seen positive query, not a new negative-control pass.",
        "Nutella400g legacy case-007 shares a metadata batch with case-004 and is excluded only from new allocation; old benchmark untouched.",
        "Eight mixed training images move to unresolved safety audit before fitting; old40training rows and all denominators remain in lineage.",
        "References exp-006/017/018 and queries exp-026 use explicit new roles, not silent reserve substitution.",
      ],
      semanticModelCalls: 0,
      independentAccuracyEstablished: false,
      integrationAllowed: false,
    },
    root,
  );
  return {
    allocation: path.relative(root, saved.path),
    sha256: saved.sha256,
    protocolSha256: protocol.sha256,
    counts,
    exactFitQueryPixelAliases: pixelAliases.length,
    modelCalls: 0,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, "use work/new-output");
  process.stdout.write(`${JSON.stringify(await freezeExpandedAllocation(process.argv[2]))}\n`);
}
