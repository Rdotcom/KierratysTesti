import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
const python = process.env.SIGLIP_PYTHON,
  assets = process.env.SIGLIP_ASSETS;
assert.ok(
  python && path.isAbsolute(python) && assets && path.isAbsolute(assets),
  "Set absolute SIGLIP_PYTHON and SIGLIP_ASSETS",
);
const directory = "mobile/app/modules/local-vision/android/src/androidTest/assets/parity";
const expected = JSON.parse(readFileSync(`${directory}/expected.json`, "utf8"));
const rows = [];
for (const row of expected.rows) {
  const input = readFileSync(`${directory}/${row.file}`);
  assert.equal(createHash("sha256").update(input).digest("hex"), row.sha256);
  const started = performance.now();
  const actual = spawnSync(
    python,
    ["-s", "backend/data-providers/python/siglip-worker.py", assets],
    {
      input,
      timeout: 15000,
      maxBuffer: 8192,
      env: {
        PATH: process.env.PATH,
        PYTHONPATH: process.env.SIGLIP_PYTHONPATH,
        PYTHONDONTWRITEBYTECODE: "1",
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        ...(process.platform === "win32"
          ? Object.fromEntries(
              ["SystemRoot", "WINDIR", "TEMP", "TMP"].flatMap((name) =>
                process.env[name] ? [[name, process.env[name]]] : [],
              ),
            )
          : {}),
      },
    },
  );
  assert.equal(actual.status, 0, "worker failed without exposing image/parser output");
  const scores = JSON.parse(actual.stdout.toString()).scores;
  assert.deepEqual(
    scores.map((r) => r.kind),
    expected.classes,
  );
  const maxError = Math.max(...scores.map((r, i) => Math.abs(r.similarity - row.scores[i])));
  const top1 = [...scores].sort((a, b) => b.similarity - a.similarity)[0].kind;
  assert.equal(top1, row.top1);
  assert.ok(maxError <= expected.maximumScoreError, `parity error ${maxError}`);
  rows.push({ id: row.id, top1, maxError, milliseconds: Math.round(performance.now() - started) });
}
for (const input of [Buffer.from("not an image"), Buffer.alloc(1_500_001)]) {
  const rejected = spawnSync(
    python,
    ["-s", "backend/data-providers/python/siglip-worker.py", assets],
    {
      input,
      timeout: 15000,
      maxBuffer: 8192,
      env: {
        PATH: process.env.PATH,
        PYTHONPATH: process.env.SIGLIP_PYTHONPATH,
        PYTHONDONTWRITEBYTECODE: "1",
        ...(process.platform === "win32"
          ? Object.fromEntries(
              ["SystemRoot", "WINDIR", "TEMP", "TMP"].flatMap((name) =>
                process.env[name] ? [[name, process.env[name]]] : [],
              ),
            )
          : {}),
      },
    },
  );
  assert.equal(rejected.status, 2);
  assert.equal(rejected.stdout.length, 0);
  assert.equal(rejected.stderr.length, 0);
}
console.log(
  JSON.stringify(
    {
      schema: "server-siglip-development-parity-v1",
      maximumScoreError: expected.maximumScoreError,
      rows,
      rejectedInvalidInputs: 2,
      scope: "Existing development images, not a recognition accuracy benchmark",
    },
    null,
    2,
  ),
);
