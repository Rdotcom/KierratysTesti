import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const ios = "mobile/app/modules/local-vision/ios/";
const engine = () => source(`${ios}local-vision-engine.swift`);

test("native readiness is a zero-image, zero-path bridge operation", () => {
  const bridge = source(`${ios}local-vision-module.swift`);
  const method = bridge.match(
    /AsyncFunction\("inspectReadiness"\)([\s\S]*?)AsyncFunction\("recognize"\)/u,
  )?.[1];
  assert.ok(method);
  assert.match(method, /\(promise: Promise\)/u);
  assert.match(method, /LocalVisionEngine\.shared\.inspectReadiness/u);
  assert.doesNotMatch(method, /jpeg|image:|base64|URL|resources|permission|recognize\(/iu);
});

test("preflight checks primary interfaces and existing pinned load, never performs inference", () => {
  const check = engine().match(
    /private static func inspectCapabilities\([\s\S]*?\n {2}func recognize\(/u,
  )?.[0];
  assert.ok(check);
  assert.match(check, /supportedRevisions/u);
  assert.match(check, /supportedIdentifiers\(\)/u);
  assert.match(check, /supportedRecognitionLanguages\(\)/u);
  assert.match(check, /predictor\.inspectReadiness\(\)/u);
  assert.doesNotMatch(
    check,
    /VNImageRequestHandler|\.perform\(|\.predict\(|CGImage|jpeg|imageBuffer/u,
  );
  const load = source(`${ios}mobileclip-predictor.swift`).match(
    /func inspectReadiness\(\) throws \{([\s\S]*?)\n {2}func predict\(/u,
  )?.[1];
  assert.ok(load);
  assert.match(load, /#available\(iOS 17\.2/u);
  assert.match(load, /_ = try load\(\)/u);
  assert.doesNotMatch(load, /prediction\(|imageBuffer|CVPixelBuffer|render\(|CGImage/u);
});

test("bounded readiness shares the actual native worker/gate with recognition", () => {
  // Explicit contextual @Sendable closure avoids Swift5's static-function
  // conversion warning without changing the worker, cache or inspection.
  assert.match(
    engine(),
    /inspection: \{ predictor in Self\.inspectCapabilities\(predictor: predictor\) \}/u,
  );
  const job = engine().match(
    /private func enqueueReadiness\(([\s\S]*?)private static func inspectCapabilities/u,
  )?.[1];
  assert.ok(job);
  assert.match(job, /guard !inFlight/u);
  assert.match(job, /worker\.async/u);
  assert.match(
    job,
    /deadline\.setEventHandler \{ delivery\.resolve\(\.unavailable\(\.timeout\)\) \}/u,
  );
  assert.ok(job.indexOf("let outcome = autoreleasepool") < job.indexOf("inFlight = false"));
  assert.ok(job.indexOf("inFlight = false") < job.indexOf("delivery.resolve(onTime"));
  assert.match(job, /systemUptime - started < deadlineSeconds/u);
  const delivery = engine().match(
    /private final class LocalVisionReadinessDelivery([\s\S]*?)#if LOCAL_VISION_QA/u,
  )?.[1];
  assert.ok(delivery);
  assert.match(delivery, /completion = nil/u);
  assert.ok(delivery.indexOf("lock.unlock()") < delivery.indexOf("callback?(result)"));
});

test("readiness explicitly describes interface evidence, not a quality score or product match", () => {
  const envelope = engine().match(
    /enum LocalVisionReadiness:([\s\S]*?)private final class LocalVisionReadinessDelivery/u,
  )?.[1];
  assert.ok(envelope);
  assert.match(envelope, /integrity_and_interface_only/u);
  assert.match(envelope, /LocalMobileClipPredictor\.promptsSha256/u);
  assert.doesNotMatch(
    envelope,
    /accuracy|confidence|verified|scores|productName|sortingBin|downloadURL/u,
  );
});
