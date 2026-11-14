import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  acquireOffExpansionV2,
  prepareOffExpansionV2,
  quarantineOrphanSelections,
} from "../qa/reference-image/prepare-off-expansion-v2.mjs";

test("quarantines an orphan annotation without inventing or deleting original images", () => {
  const x = quarantineOrphanSelections(
    JSON.stringify({
      status: 1,
      product: {
        images: {
          1: { uploader: "author" },
          front_fr: { imgid: "1" },
          packaging_it: { imgid: "60" },
        },
      },
    }),
  );
  assert.equal(x.quarantined.length, 1);
  assert.equal(x.quarantined[0].selectedView, "packaging_it");
  assert.deepEqual(x.response.product.images, {
    1: { uploader: "author" },
    front_fr: { imgid: "1" },
  });
});
test("keeps valid crops unchanged and treats malformed parents as quarantined, not accepted", () => {
  const r = { status: 1, product: { images: { 1: {}, front_fr: { imgid: "1" } } } };
  assert.deepEqual(quarantineOrphanSelections(JSON.stringify(r)), { response: r, quarantined: [] });
  for (const v of [null, [], { imgid: "../private" }, { imgid: "0" }]) {
    const x = quarantineOrphanSelections(
      JSON.stringify({ status: 1, product: { images: { front_fr: v } } }),
    );
    assert.equal(x.quarantined.length, 1);
    assert.deepEqual(x.response.product.images, {});
  }
});
test("only bounded serialized source JSON is accepted, no accessor execution", () => {
  let reads = 0;
  const x = {
    get product() {
      reads++;
      return {};
    },
  };
  for (const v of [x, "{", "x".repeat(524289), "null", JSON.stringify({ status: 0 })])
    assert.throws(() => quarantineOrphanSelections(v));
  assert.equal(reads, 0);
});
test("both canonical stages refuse repeats before source, network or output work", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "off-v2-"));
  fs.mkdirSync(path.join(root, "work"));
  fs.writeFileSync(path.join(root, "work/off-expansion-cached-plan-v2-attempt.json"), "{}");
  fs.writeFileSync(path.join(root, "work/off-expansion-images-v2-attempt.json"), "{}");
  assert.throws(() => prepareOffExpansionV2("work/new", root), /already_attempted/);
  let calls = 0;
  await assert.rejects(
    acquireOffExpansionV2("missing", "a".repeat(64), "work/new", root, async () => {
      calls++;
    }),
    /already_attempted/,
  );
  assert.equal(calls, 0);
  assert.equal(fs.existsSync(path.join(root, "work/new")), false);
});
