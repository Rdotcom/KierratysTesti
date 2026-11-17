import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { summarizeOfflineResults, wilson95 } from "../qa/review-offline-product.mjs";

const read = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
test("source-derived packaged catalogue is exact pinned data, not placeholder identities", () => {
  const raw = read("mobile/app/assets/offline-product-catalogue.json"),
    data = JSON.parse(raw);
  assert.equal(
    createHash("sha256").update(raw).digest("hex"),
    "26f35bf19a8f6029f9c020c5d19cef123e420f9f170c8e78fa4d9bf0a4fe3b33",
  );
  assert.equal(data.products.length, 5);
  assert.equal(data.references.length, 10);
  assert.ok(
    data.products.every(
      (p) =>
        p.source.verificationStatus === "source_asserted" &&
        p.manufacturer === null &&
        p.packaging === null,
    ),
  );
  assert.ok(
    data.references.every((r) => r.vector.length === 512 && r.source.licence.includes("CC-BY-SA")),
  );
});
test("barcode/product native operation stays within the shared watchdog and has no network or persistence", () => {
  const engine = read("mobile/app/modules/local-vision/ios/local-vision-engine.swift"),
    bridge = read("mobile/app/modules/local-vision/ios/local-vision-module.swift");
  assert.match(bridge, /referencePort\(\.productEvidence, input: base64\)/);
  assert.match(engine, /barcode\.symbologies = \[\.ean13, \.ean8, \.itf14\]/);
  assert.match(engine, /text\.usesLanguageCorrection = false/);
  assert.match(engine, /barcodeComplete/);
  assert.match(engine, /cancellable\.cancel\(\)/);
  assert.doesNotMatch(engine, /URLSession|URLRequest|writeFile|FileHandle\.standard/);
});
test("UI shows uncertain catalogue data without automatic sorting, raw OCR or network fallback", () => {
  const screen = read("mobile/app/src/app/local-photo.tsx"),
    result = read("mobile/app/src/components/offline-product-result.tsx");
  assert.match(screen, /recognizeOfflineProduct\(jpeg, controller\.signal\)/);
  assert.match(screen, /setProductResult\(undefined\)/);
  assert.match(screen, /<RecognitionStart/);
  const shared = read("mobile/app/src/components/recognition-presentation.tsx");
  assert.match(shared, /setValue\(""\)/);
  assert.match(shared, /AppState.addEventListener\("change"/);
  assert.match(shared, /generation.current\+\+/);
  assert.match(result, /offlineProductCompare/);
  assert.match(result, /product\.source\.licence/);
  assert.doesNotMatch(result, /cosine|textLines|\.vector|sortPackaging|requestPhoto|fetch\(/);
});
test("metrics retain failures/abstentions and never call confirmation an accepted prediction", () => {
  const rows = [
    { id: "failed", role: "product_query", failure: "timeout", resolved: null },
    {
      id: "safety",
      role: "safety_audit",
      failure: null,
      resolved: { result: { status: "unknown" }, durationMs: 5 },
    },
  ];
  const m = summarizeOfflineResults(rows);
  assert.equal(m.known, 1);
  assert.equal(m.top1Rate, 0);
  assert.equal(m.failures, 1);
  assert.equal(m.automaticVisualPrecision, null);
  assert.equal(m.automaticVisualCoverage, 0);
  assert.equal(m.publicReleaseGate, "FAIL");
  assert.equal(wilson95(0, 0), null);
  assert.ok(wilson95(41, 41)[0] < 0.99);
});
