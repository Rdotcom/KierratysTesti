// Independent receipt/source/metric and corroborating-amount checks. No OCR/ML calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recountExpandedMetrics } from "./review-expanded-corpus.mjs";
const rootDefault = fileURLToPath(new URL("../../", import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
export function independentlyReadAmount(s) {
  if (typeof s !== "string" || /[\p{Cc}\p{Cf}]/u.test(s) || s.length > 64) return null;
  const m = s
    .trim()
    .match(
      /^(?:(?:net\s*(?:weight|content|contents)|netto|poids\s+net)\s*:?\s*)?(\d{1,5})(?:[,.](\d{1,3}))?\s*(mg|kg|g|ml|cl|dl|l)\s*[e℮]?$/iu,
    );
  if (!m) return null;
  const unit = m[3].toLowerCase(),
    multipliers = { mg: 1, g: 1000, kg: 1000000, ml: 1000, cl: 10000, dl: 100000, l: 1000000 };
  const amount =
    (BigInt(m[1]) * 1000n + BigInt((m[2] ?? "").padEnd(3, "0"))) * BigInt(multipliers[unit]);
  if (amount % 1000n || amount <= 0n || amount > 100000000000n) return null;
  return `${["mg", "g", "kg"].includes(unit) ? "mass_mg" : "volume_ul"}:${amount / 1000n}`;
}
export function reviewOcrAttributeCorpus(
  lockFile,
  lockSha256,
  resultFile,
  resultSha256,
  root = rootDefault,
) {
  const read = (f, max = 24_000_000) => {
    assert.ok(
      typeof f === "string" &&
        !path.isAbsolute(f) &&
        !f.split("/").includes("..") &&
        !/[\p{Cc}\p{Cf}]/u.test(f),
    );
    assert.ok(
      /^(?:work\/|shared\/(?:domain|contracts)\/src\/|mobile\/app\/modules\/local-vision\/ios\/|scripts\/(?:qa|__tests__)\/|docs\/(?:research|final)\/|package\.json$|pnpm-lock\.yaml$)/u.test(
        f,
      ),
    );
    assert.ok(!f.split("/").some((s) => s.startsWith(".")));
    const target = path.join(root, f);
    assert.equal(fs.realpathSync(target), target);
    const before = fs.lstatSync(target, { bigint: true });
    assert.ok(before.isFile() && before.nlink === 1n && before.size <= BigInt(max));
    const b = fs.readFileSync(target),
      after = fs.lstatSync(target, { bigint: true });
    for (const k of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) assert.equal(after[k], before[k]);
    assert.equal(BigInt(b.length), before.size);
    return b;
  };
  const load = (f) => JSON.parse(read(f));
  assert.equal(sha(read(lockFile)), lockSha256);
  assert.equal(sha(read(resultFile)), resultSha256);
  const lock = load(lockFile),
    result = load(resultFile),
    dir = path.posix.dirname(resultFile);
  assert.equal(lock.schemaVersion, "ocr-attribute-lock-v1");
  assert.equal(result.schemaVersion, "ocr-attribute-result-v1");
  assert.equal(result.lockSha256, lockSha256);
  assert.equal(result.failure, null);
  for (const group of [
    lock.sources,
    lock.inputPins,
    lock.resourcePins,
    lock.jsPins,
    { [lock.binary]: lock.binarySha256 },
  ])
    for (const [f, h] of Object.entries(group)) assert.equal(sha(read(f)), h, "pin_mismatch");
  assert.equal(sha(JSON.stringify(lock.products)), lock.catalogueSha256);
  assert.equal(lock.products.length, 5);
  assert.equal(lock.queries.length, 58);
  assert.equal(result.rows.length, 58);
  assert.equal(result.calls.processes, 58);
  for (const p of lock.products) {
    const f = Object.keys(lock.inputPins).find(
        (f) => lock.inputPins[f] === p.source.snapshotSha256,
      ),
      raw = load(f);
    assert.equal(raw.product.product_name, p.name);
    assert.equal(raw.product.brands, p.brands);
    assert.equal(raw.product.quantity, p.quantity);
    assert.equal(p.source.reviewStatus, "source_asserted_pending_review");
    assert.ok(p.source.url.endsWith(`/${raw.product.code}`));
  }
  const supplements = { observed: 0, skipped: 0, unavailable: 0 },
    textCounts = { emptyOrSuppressed: 0, nonempty: 0, lines: 0 },
    reasons = {},
    newAgreements = [];
  for (let i = 0; i < 58; i++) {
    const q = lock.queries[i],
      row = result.rows[i],
      attempt = load(`${dir}/process-${i}-attempt.json`),
      receipt = load(`${dir}/process-${i}-result.json`);
    assert.equal(attempt.index, i);
    assert.equal(attempt.command, "--base64-stdin");
    assert.equal(attempt.inputSha256, q.imageSha256);
    assert.equal(attempt.lockSha256, lockSha256);
    assert.equal(receipt.index, i);
    assert.equal(receipt.status, 0);
    assert.equal(receipt.reason, null);
    assert.equal(receipt.signal, null);
    for (const stream of ["stdout", "stderr"]) {
      assert.equal(receipt[stream].file, `${dir}/process-${i}.${stream}`);
      const b = read(receipt[stream].file, 262144);
      assert.equal(sha(b), receipt[stream].sha256);
      assert.equal(b.length, receipt[stream].bytes);
      assert.equal(receipt[stream].truncated, false);
    }
    const native = load(receipt.stdout.file);
    assert.equal(native.schemaVersion, "local-vision-v4");
    assert.equal(native.engine, "apple-vision");
    assert.equal(native.classificationRevision, 2);
    assert.equal(native.classifications.length, 7);
    assert.equal(native.ocrRevision, 3);
    assert.equal(native.ocrPolicy, "material-code-lexicon-v1");
    assert.deepEqual(native.ocrLanguages, ["en-US"]);
    assert.ok(
      Array.isArray(native.textLines) &&
        native.textLines.length <= 24 &&
        native.textLines.every(
          (s) =>
            typeof s === "string" && s.length > 0 && s.length <= 64 && !/[\p{Cc}\p{Cf}]/u.test(s),
        ),
    );
    assert.ok(Object.hasOwn(supplements, native.supplement.status));
    supplements[native.supplement.status]++;
    if (native.supplement.status === "observed") {
      assert.equal(native.supplement.scores.length, 18);
      assert.ok(Object.values(lock.resourcePins).includes(native.supplement.imageWeightSha256));
    }
    textCounts[native.textLines.length ? "nonempty" : "emptyOrSuppressed"]++;
    textCounts.lines += native.textLines.length;
    assert.equal(row.id, q.id);
    assert.equal(row.productId, q.productId);
    assert.equal(row.allocationRole, q.allocationRole);
    assert.equal(row.imageSha256, q.imageSha256);
    assert.deepEqual(row.visual, lock.baselineRows[i].result);
    assert.deepEqual(row.ocr, {
      imageSha256: q.imageSha256,
      status: "observed",
      textLines: native.textLines,
    });
    assert.deepEqual(row, load(`${dir}/query-${i}.json`));
    const r = row.result;
    assert.ok(["candidate", "ambiguous", "unknown"].includes(r.status));
    assert.equal(r.queryImageSha256, q.imageSha256);
    assert.equal(r.catalogueSha256, lock.catalogueSha256);
    assert.equal(r.verificationStatus, "inferred");
    assert.equal(r.integrationAllowed, false);
    assert.equal(r.confidence, "uncalibrated_multimodal_evidence");
    assert.equal(new Set(r.productIds).size, r.productIds.length);
    assert.ok(r.productIds.every((id) => lock.products.some((p) => p.productId === id)));
    if (r.status === "unknown") assert.deepEqual(r.productIds, []);
    if (r.status === "candidate") assert.equal(r.productIds.length, 1);
    if (r.status === "ambiguous") assert.ok(r.productIds.length >= 2);
    assert.deepEqual(
      r.sources,
      lock.products.filter((p) => r.productIds.includes(p.productId)).map((p) => p.source),
    );
    reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    if (
      r.status === "candidate" &&
      ["same_family_quantity", "name_and_quantity"].includes(r.reason)
    ) {
      const amounts = [
          ...new Set(native.textLines.map(independentlyReadAmount).filter((s) => s !== null)),
        ],
        p = lock.products.find((p) => p.productId === r.productIds[0]);
      assert.equal(amounts.length, 1);
      assert.equal(amounts[0], independentlyReadAmount(p.quantity));
      if (r.reason === "same_family_quantity") {
        assert.equal(row.visual.status, "ambiguous");
        assert.ok(row.visual.productIds.includes(p.productId));
      } else assert.equal(row.visual.status, "unknown");
      if (r.productIds[0] === q.productId) newAgreements.push(q.id);
    }
    if (r.reason === "visual_preserved") {
      assert.equal(r.status, "candidate");
      assert.equal(row.visual.status, "candidate");
      assert.deepEqual(r.productIds, row.visual.productIds);
    }
  }
  const metrics = recountExpandedMetrics(result.rows, lock.previousAgreements, lock.pilots);
  assert.deepEqual(result.metrics, metrics);
  assert.equal(result.status, metrics.qualityGatePassed ? "passed" : "quality_gate_failed");
  return {
    status: "verified",
    sourcePins: Object.keys(lock.sources).length,
    dataPins: Object.keys(lock.inputPins).length,
    resourcePins: Object.keys(lock.resourcePins).length,
    nativeReceipts: 58,
    supplements,
    textCounts,
    reasons,
    newAgreements,
    metrics,
    newModelCalls: 0,
    physicalDeviceEvidence: false,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 6);
  process.stdout.write(`${JSON.stringify(reviewOcrAttributeCorpus(...process.argv.slice(2)))}\n`);
}
