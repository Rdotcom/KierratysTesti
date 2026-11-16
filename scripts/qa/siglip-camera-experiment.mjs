import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[3]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const hash = (p) => {
  assert(fs.realpathSync(p) === p && !fs.lstatSync(p).isSymbolicLink());
  const h = createHash("sha256"),
    f = fs.openSync(p, "r"),
    b = Buffer.alloc(1048576);
  try {
    for (;;) {
      const n = fs.readSync(f, b, 0, b.length, null);
      if (!n) break;
      h.update(b.subarray(0, n));
    }
  } finally {
    fs.closeSync(f);
  }
  return h.digest("hex");
};
const read = (p) => JSON.parse(fs.readFileSync(path.join(run, p)));
const write = (p, v) =>
  fs.writeFileSync(path.join(run, p), JSON.stringify(v, null, 2), { flag: "wx" });
const assets = "mobile/app/modules/local-vision/ios/SiglipCandidateAssets";
if (process.argv[2] === "prepare") {
  const rows = read("jpeg-lineage.json"),
    pins = {};
  assert.equal(rows.length, 4);
  for (const r of rows) {
    assert.equal(hash(path.join(root, r.parent)), r.parentSha256);
    assert.equal(hash(path.join(root, r.file)), r.sha256);
    pins[r.parent] = r.parentSha256;
    pins[r.file] = r.sha256;
  }
  const collect = (dir) => {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      assert(!fs.lstatSync(p).isSymbolicLink());
      if (fs.statSync(p).isDirectory()) collect(p);
      else pins[path.relative(root, p)] = hash(p);
    }
  };
  collect(path.join(root, assets));
  for (const p of [
    "local-vision-engine.swift",
    "mobileclip-predictor.swift",
    "siglip-image-encoder.swift",
    "siglip-image-preprocessor.swift",
    "siglip-object-predictor.swift",
  ])
    pins[`mobile/app/modules/local-vision/ios/${p}`] = hash(
      path.join(root, "mobile/app/modules/local-vision/ios", p),
    );
  for (const p of [
    "scripts/qa/siglip-camera-main.swift",
    "scripts/qa/siglip-camera-experiment.mjs",
    "docs/research/siglip-camera-integration-protocol-2026-11-16.md",
    "work/siglip-mobile-20261116.yV442u/baseline.json",
    "work/siglip-mobile-20261116.yV442u/lock.json",
  ])
    pins[p] = hash(path.join(root, p));
  pins[path.relative(root, path.join(run, "camera-qa-v2"))] = hash(path.join(run, "camera-qa-v2"));
  write("camera-lock.json", {
    rows,
    pins,
    networkPolicy: "(version 1) (allow default) (deny network*)",
    gate: { top1: 4, maxScoreError: 0.005 },
  });
  console.log("Frozen JPEG/native worker experiment;0predictions.");
} else if (process.argv[2] === "run") {
  const l = read("camera-lock.json");
  for (const [p, h] of Object.entries(l.pins)) assert.equal(hash(path.join(root, p)), h);
  write("mac-worker-attempt.json", { lockSha256: hash(path.join(run, "camera-lock.json")) });
  fs.mkdirSync(path.join(run, "mac-worker"));
  for (const row of l.rows) {
    const r = spawnSync(
      "/usr/bin/sandbox-exec",
      [
        "-p",
        l.networkPolicy,
        path.join(run, "camera-qa-v2"),
        "recognize",
        path.join(root, assets),
        path.join(root, row.file),
        path.join(run, `mac-worker/${row.id}.json`),
      ],
      { timeout: 20000, maxBuffer: 1000000, env: { ...process.env } },
    );
    write(`mac-worker/${row.id}-process.json`, {
      status: r.status,
      signal: r.signal,
      errorCode: r.error?.code ?? null,
    });
    fs.writeFileSync(path.join(run, `mac-worker/${row.id}.stderr`), r.stderr ?? "", { flag: "wx" });
  }
  console.log("Four actual worker attempts retained.");
} else if (process.argv[2] === "review") {
  const l = read("camera-lock.json");
  const archive = fs.existsSync(path.join(run, "source-archive/index.json"))
    ? read("source-archive/index.json")
    : [];
  for (const [p, h] of Object.entries(l.pins)) {
    const old = archive.find((item) => item.original === p && item.sha256 === h);
    const file = path.resolve(root, old?.archived ?? p);
    if (old) assert(file.startsWith(`${run}/source-archive/`));
    assert.equal(hash(file), h);
  }
  const baseline = JSON.parse(
      fs.readFileSync(path.join(root, "work/siglip-mobile-20261116.yV442u/baseline.json")),
    ),
    classes = JSON.parse(
      fs.readFileSync(path.join(root, "work/siglip-mobile-20261116.yV442u/lock.json")),
    ).classes;
  const rows = l.rows.map((row) => {
    const process = read(`mac-worker/${row.id}-process.json`);
    if (process.status !== 0)
      return { id: row.id, passed: false, failure: process.status ?? process.errorCode };
    const actual = read(`mac-worker/${row.id}.json`),
      b = baseline.find((r) => r.id === row.id);
    assert.deepEqual(
      actual.scores.map((s) => s.kind),
      classes,
    );
    assert(
      actual.scores.every((s) => Number.isFinite(s.similarity) && Math.abs(s.similarity) <= 1),
    );
    assert.equal(actual.verification, "unverified");
    assert.equal(actual.scope, "object_form_only");
    const scores = actual.scores.map((s) => s.similarity),
      top1 = classes[scores.indexOf(Math.max(...scores))],
      error = Math.max(...scores.map((x, i) => Math.abs(x - b.scores[i])));
    return {
      id: row.id,
      top1,
      maxOriginalPngScoreError: error,
      passed: top1 === b.top1 && error <= l.gate.maxScoreError,
    };
  });
  console.log(
    JSON.stringify(
      {
        rows,
        passed: rows.every((r) => r.passed),
        generalAccuracyVerified: false,
        cameraCaptureVerified: false,
      },
      null,
      2,
    ),
  );
} else throw Error("prepare|run|review work/RUN");
