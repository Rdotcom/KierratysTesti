import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const read = (file) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const ios = "mobile/app/modules/local-vision/ios/";
function releaseSource(source) {
  let depth = 0;
  return source
    .split("\n")
    .filter((line) => {
      if (!depth && line.trim() === "#if LOCAL_MEMORY_QA") {
        depth = 1;
        return false;
      }
      if (!depth) return true;
      if (/^\s*#if\b/.test(line)) depth++;
      if (/^\s*#endif\b/.test(line)) depth--;
      return false;
    })
    .join("\n");
}
test("memory probe is compiled out and cannot start through a production bridge", () => {
  assert.equal(releaseSource(read(`${ios}local-memory-probe.swift`)).trim(), "");
  const module = releaseSource(read(`${ios}local-vision-module.swift`));
  assert.doesNotMatch(module, /LocalMemoryProbe|--local-memory|memory-attribution/);
  assert.doesNotMatch(module, /Function\(".*[Mm]emory/);
});
test("diagnostic resource bundle and flag require explicit QA build configuration", () => {
  const pod = read(`${ios}KierratysLocalVision.podspec`);
  assert.match(
    pod,
    /if ENV\['KIG_MEMORY_QA'\] == '1'[\s\S]*LOCAL_MEMORY_QA[\s\S]*KierratysMemoryProbeAssets/,
  );
  const probe = read(`${ios}local-memory-probe.swift`);
  assert.match(probe, /arguments.contains\("--local-memory-qa"\)/);
  assert.match(probe, /withoutOverwriting/);
  assert.match(probe, /withIntermediateDirectories: false/);
});
test("probe accepts only frozen public input, bounded samples and three cycles", () => {
  const probe = read(`${ios}local-memory-probe.swift`);
  assert.match(probe, /42b5de1f7b4880645efef9237399a9268ce54e6c8784fca11b3a98ed7d8edf71/);
  assert.match(probe, /store.maximumRows = cameraMode \? 3000 : 900/);
  assert.match(probe, /for cycle in 1\.\.\.3/);
  assert.doesNotMatch(
    probe,
    /URLSession|URLRequest|NSLog|print\(|Documents|\.photoLibrary|AVCapturePhoto|AVCaptureVideoDataOutput|captureOutput/,
  );
});
test("sampling distinguishes charged footprint, RSS and aggregate malloc retention", () => {
  const probe = read(`${ios}local-memory-probe.swift`);
  for (const key of [
    "vm.phys_footprint",
    "vm.resident_size",
    "heap.size_in_use",
    "heap.size_allocated",
    "malloc_zone_statistics(nil",
    "malloc_zone_pressure_relief(nil, 0)",
  ])
    assert(probe.includes(key));
  assert.match(probe, /"cameraVerified": false/);
  assert.match(probe, /"failure": failure/);
});
test("diagnostic hooks disappear from production worker and predictor", () => {
  for (const file of ["local-vision-engine.swift", "siglip-object-predictor.swift"])
    assert.doesNotMatch(releaseSource(read(ios + file)), /LocalMemoryProbe/);
});
test("normal signed-app verification rejects memory probe code and fixture bundles", () => {
  const verifier = read("scripts/qa/verify-siglip-client.mjs");
  for (const marker of [
    "--local-memory-qa",
    "--local-memory-camera-qa",
    "memory-attribution-v1",
    "no_memory_qa_assets",
  ])
    assert(verifier.includes(marker));
});
