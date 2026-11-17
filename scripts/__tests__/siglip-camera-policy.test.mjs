import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ios = "mobile/app/modules/local-vision/ios/";
test("camera uses catalogue-first local coordinator and clears candidate state", () => {
  const native = source("mobile/app/src/features/local-vision/native.ts"),
    screen = source("mobile/app/src/app/local-photo.tsx");
  assert.match(
    native,
    /createCameraProductRecognizer\(\s*recognizeCataloguePhoto,\s*objectRecognizer/s,
  );
  assert.match(screen, /setObjectHint\(result.objectHint\)/);
  assert.match(screen, /setObjectHint\(undefined\)/);
  assert.match(screen, /ObjectCandidateResultView/);
  assert.match(screen, /pending.current\?\.abort/);
  assert.match(screen, /<RecognitionRecovery\s+beforeNavigate=\{clear\}/);
  assert.match(
    source("mobile/app/src/components/recognition-presentation.tsx"),
    /navigate\("\/scan"\)/,
  );
  assert.match(screen, /router.push\("\/guide"\)/);
});
test("native object inference shares serial gate, cancellation and settlement safety", () => {
  const engine = source(`${ios}local-vision-engine.swift`);
  assert.match(engine, /enqueueReferencePort\(deadlineSeconds: seconds, objectRequest:/);
  assert.match(engine, /activeObjectRequest = objectRequest/);
  assert.match(engine, /preCancelledObjectRequests.count > 32/);
  assert.match(engine, /now - \$0.value < 60/);
  assert.match(engine, /predictor.releaseCachedModel\(\)/);
  assert.match(engine, /stateLock.lock\(\); inFlight = false; activeObjectRequest = nil/);
  assert.match(engine, /object_pre_dispatch_cancel/);
});
test("candidate bundle remains separate and optional with exact immutable vendor exclusions", () => {
  const pod = source(`${ios}KierratysLocalVision.podspec`),
    biome = JSON.parse(source("biome.json"));
  assert.match(pod, /resource_bundles\['KierratysSiglipCandidates'\]/);
  assert.match(pod, /File.directory\?/);
  for (const suffix of ["vision-int8-block32.mlmodelc", "prototypes.json"])
    assert(biome.files.includes.includes(`!${ios}SiglipCandidateAssets/${suffix}`));
  assert(!biome.files.includes.includes(`!${ios}`));
  assert(!biome.files.includes.includes("!**/*.mlmodelc"));
  const predictor = source(`${ios}siglip-object-predictor.swift`);
  assert.match(predictor, /eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21/);
  assert.match(predictor, /e0490bf502e85c813dd3f640bdfcd1419f3915a5daf882da869a8bfca4525ff5/);
  assert.doesNotMatch(
    predictor,
    /static (?:var|let) (?:model|encoder): MLModel|URLSession|URLRequest|UserDefaults|NSLog|print\(/,
  );
});
test("UI exposes unverified forms with recovery, no percentage/material mapping", () => {
  const view = source("mobile/app/src/components/object-candidate-result.tsx");
  assert.match(view, /objectCandidateUnverified/);
  assert.match(view, /objectCandidateLimit/);
  assert.match(view, /accessibilityLiveRegion="polite"/);
  assert.match(view, /onPress=\{onGuide\}/);
  assert.doesNotMatch(view, /similarity|toFixed|sortPackagingComponent|materialFamily|probability/);
  const module = source(`${ios}local-vision-module.swift`);
  assert.match(module, /AsyncFunction\("recognizeObjectCandidates"\)/);
  assert.match(module, /Function\("cancelObjectCandidates"\)/);
});
