import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claimOcrCall,
  freezeOcrAttributeCorpus,
  joinOcrCatalogue,
  runOcrAttributeCorpus,
} from "../qa/reference-image/ocr-attribute-corpus.mjs";
function fixture() {
  const products = Array.from({ length: 5 }, (_, i) => ({
    productId: `source-${i}`,
    gtin: String(i),
    sourceReportedName: `Name ${i}`,
    sourceReportedBrands: "Source brand",
    sourceReportedQuantity: "400 g e",
    snapshotSha256: i.toString(16).padStart(64, "0"),
    sourceUrl: `https://example.org/product/${i}`,
    accessedOn: "2026-11-14",
  }));
  const snapshots = products.map((p) => ({
    code: p.gtin,
    sha256: p.snapshotSha256,
    product: {
      code: p.gtin,
      product_name: p.sourceReportedName,
      brands: p.sourceReportedBrands,
      quantity: p.sourceReportedQuantity,
    },
  }));
  return { plan: { products }, snapshots };
}
test("catalogue attributes must join exact source bytes/IDs/fields, never query labels", () => {
  const f = fixture(),
    r = joinOcrCatalogue(f.plan, f.snapshots);
  assert.equal(r.length, 5);
  assert.equal(r[0].source.reviewStatus, "source_asserted_pending_review");
  assert.equal(r[0].quantity, "400 g e");
  f.snapshots[0].product.quantity = "750 g";
  assert.throws(() => joinOcrCatalogue(f.plan, f.snapshots));
  const g = fixture();
  g.snapshots[0].sha256 = "f".repeat(64);
  assert.throws(() => joinOcrCatalogue(g.plan, g.snapshots));
});
test("one bounded58native-read budget, no missing/extra/retry count", () => {
  const c = { processes: 0 };
  for (let i = 0; i < 58; i++) assert.equal(claimOcrCall(c), i);
  assert.throws(() => claimOcrCall(c), /ocr_budget/);
  assert.equal(c.processes, 58);
  for (const n of [-1, NaN, 1.5, 100]) assert.throws(() => claimOcrCall({ processes: n }));
});
test("canonical freeze/run repeat refuses before source/image/native work", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kig-ocr-attribute-"));
  fs.mkdirSync(path.join(root, "work"));
  fs.writeFileSync(path.join(root, "work/ocr-attribute-v1-attempt.json"), "{}");
  await assert.rejects(freezeOcrAttributeCorpus("missing", "work/new", root), /already_attempted/);
  await assert.rejects(
    runOcrAttributeCorpus("missing", "0".repeat(64), "work/new", root),
    /already_attempted/,
  );
  assert.equal(fs.existsSync(path.join(root, "work/new")), false);
});
