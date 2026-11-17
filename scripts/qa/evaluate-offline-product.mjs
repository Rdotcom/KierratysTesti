import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "tsup";

const root = fileURLToPath(new URL("../../", import.meta.url));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const [binaryPath, outputPath, enrolledFixture, absentFixture] = process.argv.slice(2);
assert.ok(binaryPath && outputPath && enrolledFixture && absentFixture);
function scoped(file) {
  const full = path.resolve(root, file);
  assert.ok(
    full.startsWith(`${root}work/`) &&
      fs.realpathSync(full) === full &&
      fs.lstatSync(full).isFile() &&
      fs.statSync(full).size <= 8_000_000,
  );
  return full;
}
const binary = scoped(binaryPath),
  output = path.resolve(root, outputPath);
assert.ok(
  output.startsWith(`${root}work/`) &&
    fs.realpathSync(path.dirname(output)) === path.dirname(output) &&
    !fs.existsSync(output),
);
const allocationBytes = fs.readFileSync(
  scoped("work/expanded-native-2026-11-14.jNduPd/continuation-freeze/lock.json"),
);
assert.equal(
  hash(allocationBytes),
  "efdf65ee638595cedc176029138194afc8e10b20920ad0003c897c7444dfa67e",
);
const allocation = JSON.parse(allocationBytes);
const queries = allocation.rows.filter((r) =>
  ["product_query", "safety_audit"].includes(r.allocationRole),
);
// Preserve actual allocation-role spelling; no silently empty benchmark.
const selected = allocation.rows.filter(
  (r) =>
    !["reference", "calibration_negative", "excluded"].includes(r.allocationRole) &&
    r.file &&
    ["product_query", "negative_control", "unresolved_audit"].includes(r.allocationRole),
);
const rows = queries.length === 58 ? queries : selected;
assert.equal(rows.length, 58);
const fixtures = [
  ["generated-enrolled", enrolledFixture, "off-3017620422003"],
  ["generated-absent", absentFixture, null],
].map(([id, file, productId]) => ({
  id,
  file,
  productId,
  allocationRole: "generated_barcode",
  imageSha256: hash(fs.readFileSync(scoped(file))),
}));
const all = [...rows, ...fixtures];
for (const r of all) assert.equal(hash(fs.readFileSync(scoped(r.file))), r.imageSha256);
const catalogueFile = path.join(root, "mobile/app/assets/offline-product-catalogue.json");
const catalogueData = JSON.parse(fs.readFileSync(catalogueFile));
fs.mkdirSync(output);
await build({
  entry: {
    runtime: path.join(root, "mobile/app/src/features/local-vision/offline-product.ts"),
    catalogue: path.join(root, "shared/domain/src/offline-product.ts"),
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
const files = [
  "mobile/app/modules/local-vision/ios/local-vision-engine.swift",
  "mobile/app/modules/local-vision/ios/mobileclip-predictor.swift",
  "mobile/app/src/features/local-vision/offline-product.ts",
  "shared/domain/src/offline-product.ts",
  "shared/domain/src/reference-text-evidence.ts",
  "shared/contracts/src/offline-product.ts",
  "scripts/qa/evaluate-offline-product.mjs",
  "scripts/qa/protocols/offline-product-integration-protocol.md",
];
const pins = Object.fromEntries(files.map((f) => [f, hash(fs.readFileSync(path.join(root, f)))]));
const runtimeFile = path.join(output, "js/runtime.mjs"),
  catalogueBundle = path.join(output, "js/catalogue.mjs");
const lock = {
  pins,
  binarySha256: hash(fs.readFileSync(binary)),
  catalogueSha256: hash(fs.readFileSync(catalogueFile)),
  jsSha256: hash(fs.readFileSync(runtimeFile)),
  catalogueJsSha256: hash(fs.readFileSync(catalogueBundle)),
  resourcePins: allocation.resourcePins,
  queries: all.map(({ id, file, imageSha256, allocationRole, productId }) => ({
    id,
    file,
    imageSha256,
    allocationRole,
    productId,
  })),
};
for (const [file, sha] of Object.entries(lock.resourcePins))
  assert.equal(hash(fs.readFileSync(path.join(root, file))), sha);
fs.writeFileSync(path.join(output, "lock.json"), JSON.stringify(lock, null, 2), { flag: "wx" });
// Claim canonical once-only stage AFTER preparation but BEFORE any inference.
fs.writeFileSync(
  path.join(root, "work/offline-product-integration-v1-attempt.json"),
  JSON.stringify({
    output: outputPath,
    lockSha256: hash(fs.readFileSync(path.join(output, "lock.json"))),
  }),
  { flag: "wx" },
);
const networkProbe = spawnSync(
  "/usr/bin/sandbox-exec",
  [
    "-p",
    "(version 1)(allow default)(deny network*)",
    "/usr/bin/curl",
    "--connect-timeout",
    "2",
    "--max-time",
    "3",
    "-I",
    "https://example.com",
  ],
  { encoding: "utf8", timeout: 5000, env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" } },
);
assert.notEqual(networkProbe.status, 0);
fs.writeFileSync(
  path.join(output, "network-probe.json"),
  JSON.stringify({ status: networkProbe.status, stderr: networkProbe.stderr }),
  { flag: "wx" },
);
globalThis.fetch = () => {
  throw Error("runtime_network_forbidden");
};
const { createOfflineCatalogue } = await import(pathToFileURL(catalogueBundle).href);
const { resolveOfflineEvidence } = await import(pathToFileURL(runtimeFile).href);
const catalogue = createOfflineCatalogue(catalogueData);
assert.ok(catalogue);
const observations = [];
for (const row of all) {
  const bytes = fs.readFileSync(scoped(row.file));
  assert.equal(hash(bytes), row.imageSha256);
  const started = performance.now();
  const call = spawnSync(
    "/usr/bin/time",
    [
      "-l",
      "/usr/bin/sandbox-exec",
      "-p",
      "(version 1)(allow default)(deny network*)",
      binary,
      "--resources",
      "work/mobileclip-candidate-2026-11-06.M305AS/KierratysLocalVisionModels.bundle",
      "--product-evidence-stdin",
    ],
    {
      cwd: root,
      input: bytes.toString("base64"),
      encoding: "utf8",
      timeout: 20000,
      killSignal: "SIGKILL",
      maxBuffer: 262144,
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    },
  );
  const receipt = {
    id: row.id,
    imageSha256: row.imageSha256,
    allocationRole: row.allocationRole,
    expectedSourceProductId: row.productId ?? null,
    status: call.status,
    signal: call.signal,
    stdout: call.stdout,
    stderr: call.stderr,
    wallMs: performance.now() - started,
  };
  fs.writeFileSync(path.join(output, `${row.id}-native.json`), JSON.stringify(receipt), {
    flag: "wx",
  });
  let resolved = null,
    failure = null;
  try {
    assert.equal(call.status, 0);
    resolved = resolveOfflineEvidence(catalogue, call.stdout);
    assert.equal(resolved.imageSha256, row.imageSha256);
  } catch {
    failure = "native_or_contract_failure";
  }
  observations.push({
    id: row.id,
    role: row.allocationRole,
    expectedSourceProductId: row.productId ?? null,
    resolved,
    failure,
    wallMs: receipt.wallMs,
    peakRssBytes: Number(/(\d+)\s+maximum resident set size/u.exec(call.stderr ?? "")?.[1]) || null,
  });
  console.log(JSON.stringify({ id: row.id, status: resolved?.result.status ?? failure }));
}
for (const [file, sha] of Object.entries(pins))
  assert.equal(hash(fs.readFileSync(path.join(root, file))), sha);
fs.writeFileSync(
  path.join(output, "results.json"),
  JSON.stringify(
    {
      scope: "seen_source_development_not_independent_camera_accuracy",
      networkDenied: true,
      observations,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    completed: observations.length,
    failures: observations.filter((o) => o.failure).length,
  }),
);
