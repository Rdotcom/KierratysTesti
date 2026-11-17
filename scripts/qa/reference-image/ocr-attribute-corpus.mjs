// Offline, one-read native OCR experiment. No provider/network or model training.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "tsup";
import {
  checkedOutput,
  checkedWorkFile,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import { summarizeExpandedCorpus, EXPANDED_QUALITY_GATES } from "./evaluate-expanded-corpus.mjs";
const rootDefault = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const parentFile = "work/expanded-native-2026-11-14.jNduPd/continuation-freeze/lock.json",
  parentSha = "efdf65ee638595cedc176029138194afc8e10b20920ad0003c897c7444dfa67e";
const baselineFile = "work/expanded-native-2026-11-14.jNduPd/continuation-result/summary.json",
  baselineSha = "ebbf42e7591dba4f924954160bb1529a78ded04bed059b16cc42e94617145761";
const planFile = "work/off-expansion-2026-11-14.KK6s7m/plan-v2/plan.json",
  planSha = "7618f1876275d01aeb80a5401dea0bf903021cd28027358f9136fae84eebb86f";
const ledger = "work/ocr-attribute-v1-attempt.json";
const resource = "work/mobileclip-candidate-2026-11-06.M305AS/KierratysLocalVisionModels.bundle";
export const OCR_ATTRIBUTE_LIMITS = Object.freeze({
  processes: 58,
  processWallMs: 20000,
  maximumOutputBytes: 262144,
  maximumInputBytes: 1500000,
});
function pin(file, digest, root, maximum = 4_000_000) {
  const b = readBounded(
    file.startsWith("work/") ? checkedWorkFile(file, root) : path.join(root, file),
    maximum,
  );
  assert.equal(sha(b), digest, "pinned_drift");
  return b;
}
function sources(root) {
  const pins = {};
  const visit = (relative) => {
    const f = path.join(root, relative),
      stat = fs.lstatSync(f);
    assert.ok(!stat.isSymbolicLink());
    if (stat.isDirectory()) for (const n of fs.readdirSync(f).sort()) visit(`${relative}/${n}`);
    else if (/\.(?:ts|mjs|swift|json)$/u.test(f)) pins[relative] = sha(readBounded(f, 2_000_000));
    assert.ok(Object.keys(pins).length <= 512);
  };
  for (const dir of ["shared/domain/src", "shared/contracts/src", "scripts/qa/reference-image"])
    visit(dir);
  for (const f of [
    "mobile/app/modules/local-vision/ios/local-vision-engine.swift",
    "mobile/app/modules/local-vision/ios/mobileclip-predictor.swift",
    "scripts/qa/local-vision/main.swift",
    "scripts/__tests__/ocr-attribute-corpus.test.mjs",
    "scripts/qa/protocols/ocr-attribute-protocol.md",
    "scripts/qa/protocols/multimodal-recognition-plan-2026-11-14.md",
    "package.json",
    "pnpm-lock.yaml",
  ])
    pins[f] = sha(readBounded(path.join(root, f), 2_000_000));
  return pins;
}
export function joinOcrCatalogue(plan, snapshots) {
  assert.equal(plan.products.length, 5);
  assert.equal(new Set(plan.products.map((p) => p.productId)).size, 5);
  return plan.products.map((p) => {
    const snapshot = snapshots.find((s) => s.code === p.gtin);
    assert.ok(snapshot && snapshot.sha256 === p.snapshotSha256);
    assert.equal(snapshot.product.code, p.gtin);
    assert.equal(snapshot.product.product_name, p.sourceReportedName);
    assert.equal(snapshot.product.brands, p.sourceReportedBrands);
    assert.equal(snapshot.product.quantity, p.sourceReportedQuantity);
    return {
      productId: p.productId,
      name: p.sourceReportedName,
      brands: p.sourceReportedBrands,
      quantity: p.sourceReportedQuantity,
      source: {
        publisher: "Open Food Facts contributors",
        url: p.sourceUrl,
        licence: "ODbL-1.0 database / DbCL-1.0 contents",
        checkedOn: p.accessedOn,
        snapshotSha256: p.snapshotSha256,
        reviewStatus: "source_asserted_pending_review",
      },
    };
  });
}
function loadData(root) {
  const parent = JSON.parse(pin(parentFile, parentSha, root)),
    baseline = JSON.parse(pin(baselineFile, baselineSha, root)),
    plan = JSON.parse(pin(planFile, planSha, root));
  assert.equal(baseline.lockSha256, parentSha);
  assert.equal(baseline.failure, null);
  assert.equal(baseline.rows.length, 58);
  const inputPins = { [parentFile]: parentSha, [baselineFile]: baselineSha, [planFile]: planSha };
  const snapshots = plan.requests.map((r) => {
    assert.equal(r.status, "observed");
    inputPins[r.file] = r.sha256;
    const v = JSON.parse(pin(r.file, r.sha256, root));
    assert.equal(v.status, 1);
    return { code: r.code, sha256: r.sha256, product: v.product };
  });
  const products = joinOcrCatalogue(plan, snapshots),
    queries = parent.rows.filter((r) =>
      ["product_query", "safety_audit"].includes(r.allocationRole),
    );
  assert.equal(queries.length, 58);
  assert.equal(new Set(queries.map((q) => q.id)).size, 58);
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i],
      b = baseline.rows[i];
    assert.equal(q.id, b.id);
    assert.equal(q.imageSha256, b.imageSha256);
    assert.equal(q.productId, b.productId);
    assert.equal(q.allocationRole, b.allocationRole);
    pin(q.file, q.imageSha256, root, 1_500_000);
    inputPins[q.file] = q.imageSha256;
  }
  for (const [f, h] of Object.entries(parent.resourcePins)) pin(f, h, root, 24_000_000);
  for (const f of [
    "mobile/app/modules/local-vision/ios/local-vision-engine.swift",
    "mobile/app/modules/local-vision/ios/mobileclip-predictor.swift",
    "scripts/qa/local-vision/main.swift",
  ])
    assert.equal(
      sha(readBounded(path.join(root, f), 2_000_000)),
      parent.sources[f],
      "shipping_native_drift",
    );
  return { parent, baseline, products, queries, inputPins };
}
export async function freezeOcrAttributeCorpus(binaryArgument, outputArgument, root = rootDefault) {
  assert.ok(!fs.existsSync(path.join(root, ledger)), "ocr_attribute_already_attempted");
  const binary = checkedWorkFile(binaryArgument, root),
    output = checkedOutput(outputArgument, root),
    data = loadData(root),
    snapshot = sources(root);
  fs.mkdirSync(output, { mode: 0o700 });
  await build({
    entry: {
      runtime: path.join(root, "shared/domain/src/reference-vision.ts"),
      contracts: path.join(root, "shared/contracts/src/local-vision.ts"),
    },
    outDir: path.join(output, "js"),
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    bundle: true,
    splitting: false,
    noExternal: ["zod", /^@kierratysappi\//u],
    silent: true,
    clean: false,
  });
  const jsPins = Object.fromEntries(
    ["runtime", "contracts"].map((n) => {
      const f = path.relative(root, path.join(output, `js/${n}.mjs`));
      return [f, sha(readBounded(path.join(root, f), 4_000_000))];
    }),
  );
  assert.deepEqual(sources(root), snapshot);
  assert.deepEqual(loadData(root), data);
  const saved = writeJsonExclusive(
    path.join(output, "lock.json"),
    {
      schemaVersion: "ocr-attribute-lock-v1",
      sources: snapshot,
      inputPins: data.inputPins,
      resourcePins: data.parent.resourcePins,
      binary: path.relative(root, binary),
      binarySha256: sha(readBounded(binary, 16_000_000)),
      jsPins,
      products: data.products,
      catalogueSha256: sha(JSON.stringify(data.products)),
      queries: data.queries,
      baselineRows: data.baseline.rows,
      previousAgreements: data.parent.previousAgreements,
      pilots: data.parent.pilots,
      gates: EXPANDED_QUALITY_GATES,
      limits: OCR_ATTRIBUTE_LIMITS,
      node: process.version,
      nativeCallsBeforeLock: 0,
      integrationAllowed: false,
    },
    root,
  );
  return { lock: path.relative(root, saved.path), sha256: saved.sha256, nativeCalls: 0 };
}
export function claimOcrCall(counter) {
  assert.ok(
    Number.isSafeInteger(counter.processes) && counter.processes >= 0 && counter.processes < 58,
    "ocr_budget",
  );
  return counter.processes++;
}
async function nativeCall(binary, input, output, index, lockSha256, root) {
  assert.ok(input.length <= 1_500_000);
  writeJsonExclusive(
    path.join(output, `process-${index}-attempt.json`),
    { index, command: "--base64-stdin", inputSha256: sha(input), lockSha256 },
    root,
  );
  const started = performance.now();
  const result = await new Promise((resolve) => {
    const child = execFile(
      binary,
      ["--resources", resource, "--base64-stdin"],
      {
        cwd: root,
        env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
        encoding: "buffer",
        maxBuffer: OCR_ATTRIBUTE_LIMITS.maximumOutputBytes,
        timeout: OCR_ATTRIBUTE_LIMITS.processWallMs,
        killSignal: "SIGKILL",
      },
      (error, stdout, stderr) =>
        resolve({
          status: error ? (typeof error.code === "number" ? error.code : null) : 0,
          reason: error ? "required_native_failure" : null,
          signal: error?.signal ?? null,
          stdout,
          stderr,
        }),
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(input.toString("base64"));
  });
  const saved = {};
  for (const stream of ["stdout", "stderr"]) {
    const raw = result[stream];
    if (raw.length > OCR_ATTRIBUTE_LIMITS.maximumOutputBytes) result.reason = "output_bound";
    const b = raw.subarray(0, OCR_ATTRIBUTE_LIMITS.maximumOutputBytes),
      target = checkedOutput(path.join(output, `process-${index}.${stream}`), root);
    fs.writeFileSync(target, b, { flag: "wx", mode: 0o600 });
    saved[stream] = {
      file: path.relative(root, target),
      sha256: sha(b),
      bytes: b.length,
      truncated: b.length !== raw.length,
    };
  }
  writeJsonExclusive(
    path.join(output, `process-${index}-result.json`),
    {
      index,
      status: result.status,
      reason: result.reason,
      signal: result.signal,
      wallMs: Math.ceil(performance.now() - started),
      ...saved,
    },
    root,
  );
  assert.equal(result.status, 0, "required_native_failure");
  assert.equal(result.reason, null);
  return JSON.parse(result.stdout);
}
export async function runOcrAttributeCorpus(
  lockFile,
  lockHash,
  outputArgument,
  root = rootDefault,
) {
  assert.ok(!fs.existsSync(path.join(root, ledger)), "ocr_attribute_already_attempted");
  const lock = JSON.parse(pin(lockFile, lockHash, root)),
    output = checkedOutput(outputArgument, root);
  assert.equal(lock.schemaVersion, "ocr-attribute-lock-v1");
  assert.deepEqual(lock.gates, EXPANDED_QUALITY_GATES);
  assert.deepEqual(lock.limits, OCR_ATTRIBUTE_LIMITS);
  assert.equal(lock.node, process.version);
  const check = () => {
    assert.deepEqual(sources(root), lock.sources);
    const d = loadData(root);
    assert.deepEqual(d.inputPins, lock.inputPins);
    assert.deepEqual(d.products, lock.products);
    assert.deepEqual(d.queries, lock.queries);
    assert.deepEqual(d.baseline.rows, lock.baselineRows);
    assert.equal(sha(JSON.stringify(lock.products)), lock.catalogueSha256);
    for (const [f, h] of Object.entries(lock.jsPins)) pin(f, h, root);
    pin(lock.binary, lock.binarySha256, root, 16_000_000);
  };
  check();
  writeJsonExclusive(
    path.join(root, ledger),
    { lockSha256: lockHash, output: path.relative(root, output), limits: lock.limits },
    root,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  const api = await import(
      pathToFileURL(
        path.join(
          root,
          Object.keys(lock.jsPins).find((f) => f.endsWith("runtime.mjs")),
        ),
      ).href
    ),
    contracts = await import(
      pathToFileURL(
        path.join(
          root,
          Object.keys(lock.jsPins).find((f) => f.endsWith("contracts.mjs")),
        ),
      ).href
    );
  const counter = { processes: 0 },
    rows = lock.queries.map((q) => ({
      id: q.id,
      allocationRole: q.allocationRole,
      ...(q.productId ? { productId: q.productId } : {}),
      imageSha256: q.imageSha256,
      visual: null,
      ocr: null,
      result: null,
    }));
  let failure = null;
  try {
    for (let i = 0; i < lock.queries.length; i++) {
      const q = lock.queries[i],
        input = pin(q.file, q.imageSha256, root, 1_500_000),
        native = await nativeCall(
          path.join(root, lock.binary),
          input,
          output,
          claimOcrCall(counter),
          lockHash,
          root,
        );
      const parsed = contracts.NativeLocalVisionResultSchema.safeParse(native);
      assert.equal(parsed.success, true, "native_schema_failure");
      assert.equal(
        contracts.normalizeLocalVisionResult(native).status,
        "observed",
        "native_normalization_failure",
      );
      const visual = lock.baselineRows[i].result;
      rows[i].visual = visual;
      rows[i].ocr = {
        imageSha256: q.imageSha256,
        status: "observed",
        textLines: parsed.data.textLines,
      };
      rows[i].result = api.fuseReferenceTextEvidence(
        JSON.stringify({
          catalogueSha256: lock.catalogueSha256,
          products: lock.products,
          visual: {
            imageSha256: q.imageSha256,
            status: visual.status,
            productIds: visual.productIds,
          },
          ocr: rows[i].ocr,
        }),
      );
      writeJsonExclusive(path.join(output, `query-${i}.json`), rows[i], root);
      assert.ok(
        ["candidate", "ambiguous", "unknown"].includes(rows[i].result.status),
        "required_fusion_failure",
      );
      assert.equal(rows[i].result.queryImageSha256, q.imageSha256);
      assert.equal(rows[i].result.catalogueSha256, lock.catalogueSha256);
      assert.equal(rows[i].result.integrationAllowed, false);
      process.stdout.write(
        `${JSON.stringify({ query: i + 1, planned: 58, status: rows[i].result.status, textLines: parsed.data.textLines.length })}\n`,
      );
    }
    assert.equal(counter.processes, 58);
  } catch (error) {
    failure = { reason: error instanceof Error ? error.message : "failed" };
  }
  try {
    check();
  } catch {
    failure ??= { reason: "post_run_pin_drift" };
  }
  const metrics = summarizeExpandedCorpus(rows, lock.previousAgreements, lock.pilots);
  const saved = writeJsonExclusive(
    path.join(output, "summary.json"),
    {
      schemaVersion: "ocr-attribute-result-v1",
      lockSha256: lockHash,
      status: failure ? "incomplete" : metrics.qualityGatePassed ? "passed" : "quality_gate_failed",
      failure,
      metrics,
      rows,
      calls: counter,
      scope: "source_asserted_seen_development_same_image_ocr_not_gtin_or_material_verification",
      independentAccuracyEstablished: false,
      integrationAllowed: false,
    },
    root,
  );
  return {
    summary: path.relative(root, saved.path),
    sha256: saved.sha256,
    metrics,
    failure,
    calls: counter,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const result =
    a.length === 3 && a[0] === "--freeze"
      ? await freezeOcrAttributeCorpus(a[1], a[2])
      : a.length === 4 && a[0] === "--run"
        ? await runOcrAttributeCorpus(a[1], a[2], a[3])
        : null;
  assert.ok(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
