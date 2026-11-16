import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
test("official municipality geometry remains pinned and attributed, not reformatted or simplified", () => {
  const bytes = readFileSync(
    new URL("../../shared/recycling-engine/src/data/municipalities-2026.json", import.meta.url),
  );
  assert.equal(bytes.length, 2081602);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "8c81936ca7421ad34697531384a9f5f443f5dc507b7727ed3f83f4f558dcce76",
  );
  const data = JSON.parse(bytes.toString());
  assert.equal(data.municipalities.length, 308);
  assert.equal(data.source.license, "CC-BY-4.0");
  assert.equal(data.source.boundaryUncertaintyMeters, 1500);
  assert.match(data.source.transform, /no vertex\/ring removal/);
});
