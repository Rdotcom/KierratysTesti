import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
test("the independently licensed HSY and OFF offline snapshots retain pinned source evidence", () => {
  for (const [name, hash, count, key] of [
    [
      "hsy-guide.json",
      "9a25a61d44f8e491f17680bd3dd728364c1db1997f829bdafff43a96322d43ee",
      658,
      "items",
    ],
    [
      "off-finland-barcodes.json",
      "09bdb6aff5e617fa56e55286c44c41ca669f73a3f59306e3f68485a6a2470ddb",
      199,
      "products",
    ],
  ]) {
    const raw = read(`mobile/app/assets/data/${name}`),
      data = JSON.parse(raw);
    assert.equal(createHash("sha256").update(raw).digest("hex"), hash);
    assert.equal(data[key].length, count);
    assert.equal(new Set(data[key].map((item) => item.id ?? item.gtin)).size, count);
    assert.equal(data.checkedAt, "2026-11-16");
    assert(!/client_secret|client_id|Prosessilohko|<script/iu.test(raw));
    if (key === "items") {
      assert.equal(data.source.licence, "CC-BY-4.0");
      for (const item of data.items) {
        assert(item.fi.title.length > 0 && item.en.title.length > 0);
        assert.equal(typeof item.en.instructions, "string");
        assert(Array.isArray(item.fi.receivers) && Array.isArray(item.en.receivers));
      }
    } else {
      assert.match(data.source.licence, /ODbL-1.0.*DbCL-1.0/);
      assert.equal(data.source.scope, "source-tagged-sold-in-finland-not-complete-market");
      assert(!/packagingComponents|materialFamily|depositReturnStatus/.test(raw));
    }
  }
});
test("the camera manual barcode action shares the expanded lookup, not the five-reference image catalogue", () => {
  const local = read("mobile/app/src/app/local-photo.tsx"),
    copy = read("mobile/localization/src/local-vision.ts");
  assert.match(local, /lookupBarcode\(manualCode, "manual"\)/);
  assert.match(local, /onPress=\{\(\) => void lookupEnteredBarcode\(\)\}/);
  assert.doesNotMatch(local, /offlineCatalogue\?\.lookup/);
  assert.doesNotMatch(copy, /contains 5 products|on nyt 5 tuotetta/);
});
test("decorative motion is short, interruptible and never hides an answer", () => {
  const motion = read("mobile/app/src/components/motion-accent.tsx");
  for (const marker of [
    "isReduceMotionEnabled",
    "reduceMotionChanged",
    "preferenceChanged",
    "AppState",
    "stopAnimation",
    "duration: 180",
  ])
    assert(motion.includes(marker), marker);
  assert(!/Animated\.loop|opacity: 0|setInterval/.test(motion));
  const layout = read("mobile/app/src/app/_layout.tsx");
  assert.match(layout, /name="guide" options=\{\{ animation: "none" \}\}/);
  assert.match(layout, /name="result" options=\{\{ animation: "none" \}\}/);
  const guide = read("mobile/app/src/app/guide.tsx");
  assert.match(
    guide,
    /if \(sourceItemId\) scrollRef\.current\?\.scrollTo\(\{ y: 0, animated: false \}\)/,
  );
});
