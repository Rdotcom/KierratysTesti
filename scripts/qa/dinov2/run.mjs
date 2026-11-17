import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const base = path.resolve(root, process.argv[2] ?? "");
assert.ok(base.startsWith(`${root}work/`) && fs.realpathSync(base) === base);
const output = path.join(base, "evaluation"),
  ledger = path.join(root, "work/dinov2-small-v1-attempt.json");
assert.ok(!fs.existsSync(ledger) && !fs.existsSync(output), "canonical attempt already claimed");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const pins = {};
function pin(relative, expected) {
  const full = path.resolve(root, relative),
    st = fs.lstatSync(full);
  assert.ok(
    full.startsWith(root) &&
      fs.realpathSync(full) === full &&
      st.isFile() &&
      st.nlink === 1 &&
      st.size < 100_000_000,
  );
  assert.ok(!/(?:^|\/)\.env(?:\.|$)|\.pem$|\.key$/u.test(relative));
  const data = fs.readFileSync(full);
  if (expected) assert.equal(sha(data), expected);
  pins[relative] = sha(data);
  return data;
}
const allocationFile = "work/expanded-native-2026-11-14.jNduPd/continuation-freeze/lock.json";
const allocation = JSON.parse(
  pin(allocationFile, "efdf65ee638595cedc176029138194afc8e10b20920ad0003c897c7444dfa67e"),
);
const rows = [
  ...allocation.rows.filter((r) => r.allocationRole === "reference"),
  ...allocation.rows.filter((r) => ["product_query", "safety_audit"].includes(r.allocationRole)),
];
assert.equal(rows.length, 68);
assert.equal(new Set(rows.map((r) => r.id)).size, 68);
assert.equal(rows.filter((r) => r.allocationRole === "reference").length, 10);
assert.equal(rows.filter((r) => r.allocationRole === "product_query").length, 17);
for (const r of rows) pin(r.file, r.imageSha256);
const baselineFile = "work/offline-product-2026-11-14.XP0QdK/evaluation/results.json";
pin(baselineFile);
pin("work/offline-product-2026-11-14.XP0QdK/evaluation/lock.json");
for (const file of [
  "infer.py",
  "run.mjs",
  "review.mjs",
  "download.mjs",
  "requirements-macos-arm64-py312.txt",
])
  pin(`scripts/qa/dinov2/${file}`);
pin("scripts/qa/protocols/dinov2-comparison-protocol.md");
const modelDirectory = path.relative(root, path.join(base, "model"));
const receipt = JSON.parse(pin(`${modelDirectory}/download-receipt.json`));
assert.equal(receipt.revision, "ed25f3a31f01632728cabb09d1542f84ab7b0056");
assert.equal(receipt.receipts.length, 5);
for (const r of receipt.receipts) {
  assert.ok(
    [
      "config.json",
      "preprocessor_config.json",
      "README.md",
      "LICENSE",
      "model.safetensors",
    ].includes(r.name),
  );
  pin(`${modelDirectory}/${r.name}`, r.sha256);
}
assert.equal(
  pins[`${modelDirectory}/model.safetensors`],
  "ae1e99fcefd534ed978cdeb8326f08030c96e28b7a81ffcbc98a857c84d14be1",
);
fs.mkdirSync(output);
const env = {
  PATH: "/usr/bin:/bin",
  HF_HUB_OFFLINE: "1",
  TRANSFORMERS_OFFLINE: "1",
  HF_HUB_DISABLE_TELEMETRY: "1",
  TOKENIZERS_PARALLELISM: "false",
};
const python = path.join(base, "venv/bin/python");
const installed = spawnSync(
  python,
  [
    "-I",
    "-c",
    'import importlib.metadata as m,json;print(json.dumps({d.metadata["Name"]:d.version for d in m.distributions()},sort_keys=True))',
  ],
  { cwd: root, env, encoding: "utf8", timeout: 30000 },
);
assert.equal(installed.status, 0);
const runtime = JSON.parse(installed.stdout);
assert.equal(runtime.torch, "2.15.0");
assert.equal(runtime.transformers, "5.23.0");
const lock = {
  version: "dinov2-small-comparison-v1",
  pins,
  modelDirectory,
  baselineFile,
  rows,
  pilots: allocation.pilots,
  runtime,
  networkPolicy: "(version 1)(allow default)(deny network*)",
  integrationAllowed: false,
};
const lockBytes = Buffer.from(JSON.stringify(lock, null, 2));
fs.writeFileSync(path.join(output, "lock.json"), lockBytes, { flag: "wx" });
const probe = spawnSync(
  "/usr/bin/sandbox-exec",
  [
    "-p",
    lock.networkPolicy,
    "/usr/bin/curl",
    "--connect-timeout",
    "3",
    "--max-time",
    "5",
    "--silent",
    "--show-error",
    "https://huggingface.co",
  ],
  { env, encoding: "utf8", timeout: 10000, maxBuffer: 32000 },
);
assert.ok(Number.isInteger(probe.status) && probe.status !== 0 && !probe.error);
fs.writeFileSync(
  path.join(output, "network-probe.json"),
  JSON.stringify({ status: probe.status, stderr: probe.stderr, stdoutBytes: probe.stdout.length }),
  { flag: "wx" },
);
fs.writeFileSync(
  ledger,
  JSON.stringify({ output: path.relative(root, output), lockSha256: sha(lockBytes) }),
  { flag: "wx" },
);
const result = spawnSync(
  "/usr/bin/sandbox-exec",
  ["-p", lock.networkPolicy, python, "-I", path.join(root, "scripts/qa/dinov2/infer.py"), output],
  { cwd: root, env, encoding: "utf8", timeout: 900000, maxBuffer: 2000000 },
);
fs.writeFileSync(
  path.join(output, "process.json"),
  JSON.stringify({
    status: result.status,
    signal: result.signal,
    error: result.error?.code ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
  }),
  { flag: "wx" },
);
assert.equal(
  result.status,
  0,
  "inference process failed; retain this attempt and partial receipts",
);
console.log(
  JSON.stringify({
    output: path.relative(root, output),
    lockSha256: sha(lockBytes),
    completed: true,
  }),
);
