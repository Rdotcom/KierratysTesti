import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const read = (file) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const ios = "mobile/app/modules/local-vision/ios/";
test("JPEG dependency is version/hash pinned and scalar, no downloaded model change", () => {
  const build = read("scripts/qa/build-pinned-jpeg.mjs");
  for (const pin of [
    "7b4993786d856cbccabfc0ed2f923ba000e326cc",
    "e10ff4ce2943a9021f9b0398fe00029915dd4eaf32c7560e36305341ec826735",
    "-DWITH_SIMD=OFF",
    "never_overwrite_staged_decoder",
  ])
    assert(build.includes(pin));
});
test("C adapter bounds resources and fails on decoder warnings without file/network IO", () => {
  const c = read(`${ios}jpeg-decoder.c`);
  for (const bound of [
    "length > 8000000",
    "width > 4096",
    "height > 4096",
    "TJPARAM_MAXMEMORY, 32",
    "TJPARAM_MAXPIXELS, 8000000",
    "TJPARAM_SCANLIMIT, 100",
    "TJPARAM_STOPONWARNING, 1",
    "TJPARAM_FASTDCT, 0",
    "TJPARAM_FASTUPSAMPLE, 0",
    "TJPARAM_PRECISION) != 8",
    "tj3Destroy(decoder)",
  ])
    assert(c.includes(bound));
  assert.doesNotMatch(c, /fopen|fwrite|socket|printf|system\(/);
});
test("new JPEG policy is explicit, preserves PNG math and fails closed without dependency", () => {
  const swift = read(`${ios}siglip-image-encoder.swift`),
    ts = read("mobile/app/src/features/local-vision/object-candidates.ts");
  const identity = "siglip2-jpeg-turbo3.2.1-islow-nosimd-srgb-aa22-224-nchw-v2";
  assert(swift.includes(identity) && ts.includes(identity));
  assert.match(swift, /#if KIG_PINNED_JPEG/);
  assert.match(swift, /No silent return to OS-dependent JPEG/);
  assert.match(swift, /SiglipImagePreprocessor.tensor/);
  assert.match(swift, /profile.lowercased\(\).contains\("srgb"\)/);
});
test("new dependency notices are bundled separately and attributed in both languages", () => {
  const pod = read(`${ios}KierratysLocalVision.podspec`);
  assert.match(pod, /KierratysJpegDecoderNotices/);
  assert.match(pod, /JpegDecoderAssets\/README.ijg/);
  assert.match(read("mobile/app/src/app/legal.tsx"), /objectDecoderAttribution/);
  assert.equal(
    read("mobile/localization/src/object-candidates.ts").split(
      "This software is based in part on the work of the Independent JPEG Group.",
    ).length - 1,
    2,
  );
});
