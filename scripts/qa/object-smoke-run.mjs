// Freeze then dispatch exactly one attempt/model; review never invokes a model.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { objectSmoke, summarizeObjectSmoke } from "./object-smoke-protocol.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const run = path.resolve(root, process.argv[3] ?? "");
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const relative = (p) => path.relative(root, p);
function digest(file) {
  assert.equal(fs.realpathSync(file), file);
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= 1_550_000_000);
  const hash = createHash("sha256"),
    fd = fs.openSync(file, "r"),
    buffer = Buffer.alloc(1024 * 1024);
  try {
    for (;;) {
      const n = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (n === 0) break;
      hash.update(buffer.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(fs.statSync(file).size, stat.size);
  return hash.digest("hex");
}
function write(name, data) {
  fs.writeFileSync(path.join(run, name), JSON.stringify(data, null, 2), { flag: "wx" });
}
function walk(dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const f = path.join(dir, name);
    assert(!fs.lstatSync(f).isSymbolicLink());
    return fs.statSync(f).isDirectory() ? walk(f) : [f];
  });
}
if (process.argv[2] === "prepare") {
  assert(!fs.existsSync(path.join(run, "lock.json")), "already_frozen");
  const pins = {},
    pin = (file, expected) => {
      const f = path.resolve(root, file),
        h = digest(f);
      if (expected) assert.equal(h, expected);
      pins[relative(f)] = h;
      return f;
    };
  const data = "work/object-clean-20261116.oaxGJU/clean-v4/";
  const manifest = JSON.parse(
    fs.readFileSync(
      pin(
        `${data}combined-manifest.json`,
        "fddc61ba656959f57368dd80317680351f9e1950dc0f5e8108abcda65c65d2ab",
      ),
    ),
  );
  const audit = JSON.parse(
    fs.readFileSync(
      pin(
        `${data}file-audit.json`,
        "d104250295a5e952463a7f853898503d2d873671b74eb333d97f0af4c9a6c687",
      ),
    ),
  );
  const rows = objectSmoke.rows.map((p) => {
    const r = manifest.images.find((r) => r.id === p.id),
      proof = audit.receipts.find((r) => r.id === p.id);
    assert(
      r?.origin === "derived" &&
        r.pool === "development" &&
        proof?.metadataPresent === false &&
        proof.imageSha256 === r.sha256,
    );
    pin(r.file, r.sha256);
    pin(r.evidenceFile, r.evidenceSha256);
    return { id: r.id, file: r.file, imageSha256: r.sha256 };
  });
  const assets = "work/mobileclip-candidate-2026-11-06.M305AS/assets-validated";
  for (const spec of JSON.parse(
    fs.readFileSync(pin("scripts/qa/local-vision/mobileclip-assets.json")),
  ).assets)
    pin(`${assets}/${spec.path}`, spec.sha256);
  for (const file of walk(path.join(run, "compiled"))) pin(relative(file));
  const receipt = JSON.parse(
    fs.readFileSync(pin(relative(path.join(run, "model/download-receipt.json")))),
  );
  assert.equal(receipt.revision, "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2");
  assert.equal(receipt.receipts.length, 7);
  for (const file of receipt.receipts)
    pin(relative(path.join(run, "model", file.name)), file.sha256);
  for (const file of [
    "scripts/qa/object-smoke-protocol.mjs",
    "scripts/qa/object-smoke-run.mjs",
    "scripts/qa/object-smoke-mobileclip.swift",
    "scripts/qa/object-smoke-siglip.py",
    "scripts/qa/local-vision/mobileclip-tokenizer.swift",
    "docs/research/object-model-smoke-protocol-2026-11-16.md",
    relative(path.join(run, "mobileclip-smoke-v1")),
  ])
    pin(file);
  const python = "work/dinov2-comparison-2026-11-15.gkByIM/venv/bin/python";
  const lock = {
    schemaVersion: objectSmoke.version,
    createdAt: new Date().toISOString(),
    classes: objectSmoke.classes,
    prompts: objectSmoke.prompts,
    rows,
    expected: objectSmoke.rows,
    excluded: objectSmoke.excluded,
    assets,
    compiled: relative(path.join(run, "compiled")),
    modelDirectory: relative(path.join(run, "model")),
    python,
    pins,
    networkPolicy: "(version 1)(allow default)(deny network*)",
    comparison:
      "development-only; no automatic acceptance; differing model-specific preprocessing; no model promotion",
  };
  write("lock.json", lock);
  console.log(
    `Frozen ${rows.length} image rows, ${Object.keys(pins).length} pins; zero model calls.`,
  );
} else if (process.argv[2] === "run") {
  const lock = JSON.parse(fs.readFileSync(path.join(run, "lock.json"))),
    lockHash = digest(path.join(run, "lock.json"));
  for (const [file, hash] of Object.entries(lock.pins))
    assert.equal(digest(path.join(root, file)), hash, "input_drift");
  write("attempt.json", {
    lockHash,
    startedAt: new Date().toISOString(),
    maximumImageCalls: 8,
    retries: 0,
  });
  const probe = spawnSync(
    "/usr/bin/sandbox-exec",
    [
      "-p",
      lock.networkPolicy,
      process.execPath,
      "-e",
      "fetch('https://huggingface.co',{signal:AbortSignal.timeout(2000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))",
    ],
    { timeout: 10000 },
  );
  assert.equal(probe.status, 0, "network_denial_not_proved");
  const definitions = [
    ["mobileclip", path.join(run, "mobileclip-smoke-v1"), [relative(run)], 180000],
    [
      "siglip2",
      path.join(root, lock.python),
      ["-I", path.join(root, "scripts/qa/object-smoke-siglip.py"), relative(run)],
      240000,
    ],
  ];
  const all = [],
    statuses = [];
  for (const [model, executable, args, timeout] of definitions) {
    const result = spawnSync(
      "/usr/bin/sandbox-exec",
      ["-p", lock.networkPolicy, executable, ...args],
      {
        cwd: root,
        timeout,
        maxBuffer: 4_000_000,
        env: {
          ...process.env,
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
          TOKENIZERS_PARALLELISM: "false",
        },
      },
    );
    fs.writeFileSync(path.join(run, `${model}.stdout`), result.stdout ?? "", { flag: "wx" });
    fs.writeFileSync(path.join(run, `${model}.stderr`), result.stderr ?? "", { flag: "wx" });
    const lines = (result.stdout?.toString() ?? "")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((s) => JSON.parse(s));
    for (const row of lock.rows) {
      const matched = lines.filter((r) => r.id === row.id && r.model === model);
      assert(matched.length <= 1, "duplicate_model_output");
      const value = matched[0] ?? {
        model,
        id: row.id,
        failure: "process_failed_or_missing_output",
      };
      if (!value.failure) assert.equal(value.imageSha256, row.imageSha256, "image_join");
      all.push(value);
    }
    statuses.push({
      model,
      status: result.status,
      signal: result.signal,
      errorCode: result.error?.code ?? null,
    });
    console.log(`${model}: process exit ${result.status}; ${lines.length} result rows retained`);
  }
  write("observations.json", { lockHash, statuses, rows: all });
  write("summary.json", {
    lockHash,
    results: summarizeObjectSmoke(all),
    inferenceCalls:
      "8 image attempts; mobile15text forwards, SigLIP15texts in one batch if model load succeeds",
    releaseReady: false,
  });
} else if (process.argv[2] === "review") {
  const lock = JSON.parse(fs.readFileSync(path.join(run, "lock.json"))),
    lockHash = digest(path.join(run, "lock.json"));
  for (const [file, hash] of Object.entries(lock.pins))
    assert.equal(digest(path.join(root, file)), hash, "review_pin_drift");
  const observed = JSON.parse(fs.readFileSync(path.join(run, "observations.json"))),
    saved = JSON.parse(fs.readFileSync(path.join(run, "summary.json")));
  assert.equal(observed.lockHash, lockHash);
  assert.equal(saved.lockHash, lockHash);
  for (const row of observed.rows)
    if (!row.failure)
      assert.equal(row.imageSha256, lock.rows.find((r) => r.id === row.id).imageSha256);
  assert.deepEqual(saved.results, summarizeObjectSmoke(observed.rows));
  for (const model of ["mobileclip", "siglip2"]) {
    const raw = fs
      .readFileSync(path.join(run, `${model}.stdout`), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((s) => JSON.parse(s));
    let positives = 0,
      controls = 0;
    for (const planned of lock.expected) {
      const records = raw.filter((r) => r.id === planned.id && r.model === model);
      assert(records.length <= 1, "raw_duplicate");
      const stored = observed.rows.find((r) => r.id === planned.id && r.model === model);
      if (!records.length) {
        assert(stored.failure, "unreported_missing_row");
        continue;
      }
      const actual = records[0];
      assert.deepEqual(actual, stored, "raw_observation_mismatch");
      if (actual.failure) continue;
      const maximum = Math.max(...actual.scores.map((s) => s.cosine));
      const leaders = actual.scores
        .filter((s) => s.cosine === maximum)
        .map((s) => s.group)
        .sort();
      if (leaders[0] === planned.expected) {
        if (planned.role === "text-free-positive") positives++;
        else controls++;
      }
    }
    assert.equal(saved.results[model].positiveTop1, positives, "independent_positive_recount");
    assert.equal(saved.results[model].controlTop1, controls, "independent_control_recount");
  }
  console.log(JSON.stringify({ verified: true, lockHash, results: saved.results }, null, 2));
} else throw Error("usage: object-smoke-run.mjs prepare|run|review work/RUN");
