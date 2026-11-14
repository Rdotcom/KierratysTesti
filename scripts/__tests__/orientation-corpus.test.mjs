import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  freezeOrientationCorpus,
  runOrientationCorpus,
  validateOrientationVariants,
} from "../qa/reference-image/evaluate-orientation-corpus.mjs";
import {
  claimOrientationCorpusCall,
  claimExpandedCorpusCall,
  ORIENTATION_CORPUS_LIMITS,
} from "../qa/reference-image/native-corpus-transport.mjs";
function fixture() {
  const queries = Array.from({ length: 58 }, (_, i) => ({
    id: `q-${i}`,
    imageSha256: i.toString(16).padStart(64, "0"),
  }));
  return {
    queries,
    variants: queries.flatMap((q, i) =>
      [90, 180, 270].map((rotation) => ({
        id: q.id,
        rotation,
        originalImageSha256: q.imageSha256,
        imageSha256: (1000 + 3 * i + rotation).toString(16).padStart(64, "0"),
        bytes: 100,
      })),
    ),
  };
}
test("all174derived views keep original58query/angle/byte lineage", () => {
  const f = fixture();
  validateOrientationVariants(f.variants, f.queries);
  assert.throws(() => validateOrientationVariants(f.variants.slice(1), f.queries));
  f.variants[0].originalImageSha256 = "f".repeat(64);
  assert.throws(() => validateOrientationVariants(f.variants, f.queries));
  const g = fixture();
  g.variants[0].rotation = 180;
  assert.throws(() => validateOrientationVariants(g.variants, g.queries));
});
test("new work budget is1044plus538cached without enlarging prior experiment", () => {
  const c = { capabilities: 0, hashes: 0, encodes: 0, decodes: 0, processes: 0 };
  for (const k of ["capabilities", "hashes", "encodes", "decodes"]) {
    for (let i = 0; i < ORIENTATION_CORPUS_LIMITS[k]; i++) claimOrientationCorpusCall(c, k);
    assert.throws(() => claimOrientationCorpusCall(c, k));
  }
  assert.equal(c.processes, 1582);
  assert.equal(c.encodes, 274);
  assert.throws(() => claimExpandedCorpusCall({ ...c, processes: 100, encodes: 100 }, "encodes"));
});
test("canonical stages refuse duplicate preparation/inference before input work", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kig-orientation-"));
  fs.mkdirSync(path.join(root, "work"));
  fs.writeFileSync(path.join(root, "work/orientation-reference-v1-prepare.json"), "{}");
  fs.writeFileSync(path.join(root, "work/orientation-reference-v1-attempt.json"), "{}");
  await assert.rejects(freezeOrientationCorpus("work/new", root), /already_prepared/);
  await assert.rejects(
    runOrientationCorpus("missing", "0".repeat(64), "work/new", root),
    /already_attempted/,
  );
  assert.equal(fs.existsSync(path.join(root, "work/new")), false);
});
