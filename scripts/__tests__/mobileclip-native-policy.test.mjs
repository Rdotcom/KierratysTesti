import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const ios = "mobile/app/modules/local-vision/ios/";
const resource = path.join(root, ios, "Resources");
const source = (file) => readFileSync(path.join(root, file), "utf8");
const digest = (relative) =>
  createHash("sha256")
    .update(readFileSync(path.join(resource, relative)))
    .digest("hex");
const pins = {
  "mobileclip_s0_image.mlpackage/Data/com.apple.CoreML/model.mlmodel":
    "2c1afa132c41c6535817cc67894bd7484bc2cbd084ed5e2f12b24f611af17591",
  "mobileclip_s0_image.mlpackage/Data/com.apple.CoreML/weights/weight.bin":
    "87d8f63997bbd2f38ba7defeaaa2c571928bdece56aa9629542198b3ce906ed6",
  "mobileclip_s0_image.mlpackage/Manifest.json":
    "fe07dde983dae92c1799132816ce55f9ff8487f2681b530abf7222025aa27fa4",
  "mobileclip-prototypes.bin": "0dfe73569d1b2177629d95c4bc21c1392be9228aff6809cab0ed1c3358893c81",
  "mobileclip-source-spec.bin": "2c1afa132c41c6535817cc67894bd7484bc2cbd084ed5e2f12b24f611af17591",
  "mobileclip-source-manifest.bin":
    "fe07dde983dae92c1799132816ce55f9ff8487f2681b530abf7222025aa27fa4",
  "Notices/apple-weights-2024.txt":
    "a94a7a9c59509751580a31fa1ab3b418a97b01304549d382b8b96ca8fa85a179",
  "Notices/apple-software-mit.txt":
    "7be983907ac2fa52c53e29ad8eca89d67d1e77bcc46a0271702845d0a1f4114d",
  "Notices/apple-acknowledgements.txt":
    "1fdf63aae2e325e2efde1aed1d3cc9addb063ea60a31f40d2a564bd7c29ac283",
  "Notices/huggingface-tokenizer-apache2.txt":
    "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
  // New native resampler licence only; all original model/prototype pins stay fixed.
  "Notices/pillow-mit-cmu.txt": "1c277f85552757f5b48fd1fdac746e23a2ecef4f81bb5903c297cc63d209e0a8",
};

function files(directory = resource) {
  return readdirSync(directory).flatMap((entry) => {
    const file = path.join(directory, entry);
    const stat = lstatSync(file);
    assert.equal(stat.isSymbolicLink(), false, "bundled resources must not be links");
    return stat.isDirectory() ? files(file) : [path.relative(resource, file)];
  });
}

test("native image package has exactly the three pinned original Apple2024 files", () => {
  const names = files().filter((file) => file.startsWith("mobileclip_s0_image.mlpackage/"));
  assert.equal(names.length, 3);
  for (const file of names) assert.equal(digest(file), pins[file], file);
});

test("packaged prototypes retain the frozen eighteen finite unit vectors", () => {
  assert.equal(digest("mobileclip-prototypes.bin"), pins["mobileclip-prototypes.bin"]);
  const data = JSON.parse(readFileSync(path.join(resource, "mobileclip-prototypes.bin"), "utf8"));
  const policy = JSON.parse(source("scripts/qa/local-vision/mobileclip-prompts.json"));
  assert.equal(data.schemaVersion, "mobileclip-prototypes-v1");
  assert.equal(data.modelId, "apple-mobileclip-s0-coreml-2024");
  assert.equal(data.modelRevision, "55c8098c12ba8f928e37e26b2e1dd097777c3f98");
  assert.equal(
    data.promptsSha256,
    createHash("sha256")
      .update(source("scripts/qa/local-vision/mobileclip-prompts.json"))
      .digest("hex"),
  );
  assert.equal(data.computeUnits, "cpuOnly");
  assert.deepEqual(
    data.groups.map((group) => group.group),
    policy.groups.map((group) => group.identifier),
  );
  for (const [index, group] of data.groups.entries()) {
    assert.equal(group.role, index < 5 ? "supported" : "outside");
    assert.equal(group.embedding.length, 512);
    assert.ok(group.embedding.every(Number.isFinite));
    const length = Math.sqrt(group.embedding.reduce((sum, value) => sum + value * value, 0));
    assert.ok(Math.abs(length - 1) < 0.00001);
  }
});

test("app resources contain no text model or tokenizer and remain below thirty MB", () => {
  const names = files();
  assert.deepEqual(names.sort(), Object.keys(pins).sort());
  assert.ok(names.every((name) => !/text\.ml|tokenizer\.swift|clip-vocab|clip-merges/u.test(name)));
  const total = names.reduce((sum, name) => sum + lstatSync(path.join(resource, name)).size, 0);
  assert.ok(total > 22_000_000 && total < 30_000_000, `resource bytes:${total}`);
});

test("full original weight/software/component notices are present byte-for-byte", () => {
  for (const file of Object.keys(pins).filter((name) => name.startsWith("Notices/"))) {
    assert.equal(digest(file), pins[file], file);
    assert.ok(lstatSync(path.join(resource, file)).size > 1000);
  }
  assert.match(
    readFileSync(path.join(resource, "Notices/apple-weights-2024.txt"), "utf8"),
    /2024 Apple/,
  );
});

test("runtime verifies source provenance, compiled weights/graph and prototypes before model loading", () => {
  const helper = source(`${ios}mobileclip-predictor.swift`);
  for (const file of [
    "mobileclip-source-spec.bin",
    "mobileclip-source-manifest.bin",
    "mobileclip-prototypes.bin",
  ])
    assert.equal(digest(file), pins[file]);
  for (const hash of [
    pins["mobileclip-source-spec.bin"],
    pins["mobileclip-source-manifest.bin"],
    pins["mobileclip-prototypes.bin"],
    pins["mobileclip_s0_image.mlpackage/Data/com.apple.CoreML/weights/weight.bin"],
    "858f2fc75c7d7b2fd182c1a13ae099a3f66c16ba1d0ea72375a0cdf6fe97b984",
  ])
    assert.ok(helper.includes(hash), hash);
  assert.ok(
    helper.indexOf('path: "mobileclip-prototypes.bin"') < helper.indexOf("MLModel(contentsOf:"),
  );
  assert.match(helper, /SHA256\(\)/);
  assert.match(helper, /count <= bytes/);
  assert.match(helper, /actual == digest/);
  assert.match(helper, /isSymbolicLink != true/);
});

test("pod resources compile the image model and retain binary provenance and notices", () => {
  const podspec = source(`${ios}KierratysLocalVision.podspec`);
  for (const text of [
    "KierratysLocalVisionModels",
    "Resources/mobileclip_s0_image.mlpackage",
    "Resources/mobileclip-prototypes.bin",
    "Resources/mobileclip-source-spec.bin",
    "Resources/mobileclip-source-manifest.bin",
    "Resources/Notices/*.txt",
    "CoreML",
    "CryptoKit",
  ])
    assert.ok(podspec.includes(text), text);
  assert.doesNotMatch(podspec, /mobileclip_s0_text|clip-vocab|clip-merges/);
});

test("immutable vendor format exclusion is exact while other gates remain enabled", () => {
  const biome = JSON.parse(source("biome.json"));
  assert.equal(biome.formatter.enabled, true);
  assert.equal(biome.linter.enabled, true);
  const vendor = biome.files.includes.filter((value) => /mobileclip|mlpackage/u.test(value));
  assert.deepEqual(vendor, [
    "!mobile/app/modules/local-vision/ios/Resources/mobileclip_s0_image.mlpackage",
  ]);
  for (const broad of ["!mobile", "!mobile/app/modules", "!**/*.json", "!**/*.mlpackage"])
    assert.ok(!biome.files.includes.includes(broad));
});

test("native predictor performs no networking, image persistence, logging or winner selection", () => {
  const helper = source(`${ios}mobileclip-predictor.swift`);
  assert.match(helper, /predict\(image: CGImage, orientation: CGImagePropertyOrientation\)/);
  assert.match(helper, /isAllowedValue\(value\)/);
  assert.match(helper, /array\.count == 512/);
  assert.match(helper, /allSatisfy\(\\\.isFinite\)/);
  assert.match(helper, /private init\(\) \{\}/);
  assert.match(helper, /\.cacheIntermediates: false/);
  assert.match(helper, /defer \{ loaded\.context\.clearCaches\(\) \}/);
  assert.doesNotMatch(
    helper,
    /URLSession|URLRequest|NSLog|print\(|FileHandle\.standard|\.write\(|forWritingTo|process\.env|ProcessInfo\.processInfo\.environment/,
  );
  assert.doesNotMatch(helper, /private var[^\n]*(?:CGImage|CVPixelBuffer|Data)\b/);
  assert.doesNotMatch(helper, /winner\s*=|\.max\(by:|0\.20|0\.020/);
});

test("resource override exists only in QA and is absent from shipping bridge configuration", () => {
  const helper = source(`${ios}mobileclip-predictor.swift`);
  assert.match(helper, /#if LOCAL_VISION_QA\s+private var qaResourceURL/);
  const shipping = helper.replace(/#if LOCAL_VISION_QA[\s\S]*?#endif/gu, "");
  assert.doesNotMatch(shipping, /qaResourceURL|resourcesURL: URL/);
  assert.match(shipping, /guard #available\(iOS 17\.2/);
  const bridge = source(`${ios}local-vision-module.swift`);
  assert.deepEqual(
    [...bridge.matchAll(/AsyncFunction\("([^"]+)"\)/gu)].map((match) => match[1]),
    [
      "recognizeProductEvidence",
      "inspectReferenceCapabilities",
      "hashReferenceBytes",
      "encodeReferenceImage",
      "decodeReferenceRgb",
      "inspectReadiness",
      "recognize",
    ],
  );
  assert.doesNotMatch(bridge, /resourcesURL|modelPath|proxy|configureResources|process\.env/);
});

test("experimental reference operations retain native ownership, limits and uncertainty", () => {
  const engine = source(`${ios}local-vision-engine.swift`);
  const method = engine.match(
    /func referencePort\([\s\S]*?private static func inspectCapabilities/u,
  )?.[0];
  assert.ok(method);
  assert.match(method, /input\.utf8\.count <= Self\.maxBase64Length/u);
  assert.match(method, /guard !inFlight else/u);
  assert.match(method, /LocalReferencePortDelivery/u);
  assert.match(method, /try decodeJPEG\(jpegBase64: input\)/u);
  assert.match(method, /SHA256\.hash\(data: bytes\)/u);
  assert.match(method, /"integrationAllowed": false/u);
  assert.match(method, /width <= 1024, height <= 1024, width \* height <= 1_048_576/u);
  assert.doesNotMatch(
    method,
    /URLSession|URLRequest|print\(|NSLog|forWritingTo|Data\(contentsOf:/u,
  );
  assert.doesNotMatch(method, /drawing\.scaleBy\(x: 1, y: -1\)/u);
});

test("reference encoder uses a distinct pinned full-frame identity and default path stays centered", () => {
  const helper = source(`${ios}mobileclip-predictor.swift`);
  assert.match(helper, /ios-reference-encoder-v1/u);
  assert.match(helper, /aspect-fit-256-srgb-gray127-v1/u);
  assert.match(
    helper,
    /compiledGraphSha256, sourceSpecSha256, sourceManifestSha256, prototypesSha256/u,
  );
  assert.match(helper, /embedding\(image: image, orientation: orientation, fullFrame: false\)/u);
  assert.match(helper, /fullFrame: true, deadlineAt: deadlineAt/u);
  assert.match(helper, /try checkDeadline\(\)/u);
  assert.match(
    helper,
    /array\.shape\.map\(\\\.intValue\) == \[1, 512\], array\.dataType == \.float32/u,
  );
});
