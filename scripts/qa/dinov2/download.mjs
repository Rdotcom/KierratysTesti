// Preparation only. Never runs inference or imports remotely supplied Python.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const revision = "ed25f3a31f01632728cabb09d1542f84ab7b0056";
const target = path.resolve(root, process.argv[2] ?? "");
assert.ok(target.startsWith(`${root}work/`) && !fs.existsSync(target));
assert.equal(fs.realpathSync(path.dirname(target)), path.dirname(target));
const sha = (b) => createHash("sha256").update(b).digest("hex");
async function download(address, maximum, redirects = 0) {
  const url = new URL(address);
  assert.ok(url.protocol === "https:" && !url.username && !url.password);
  assert.ok(
    ["huggingface.co", "raw.githubusercontent.com"].includes(url.hostname) ||
      url.hostname.endsWith(".hf.co") ||
      url.hostname.endsWith(".huggingface.co"),
  );
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(120000) });
  if (response.status >= 300 && response.status < 400) {
    assert.ok(redirects < 5);
    return download(new URL(response.headers.get("location"), url).href, maximum, redirects + 1);
  }
  assert.equal(response.status, 200);
  assert.ok(Number(response.headers.get("content-length") ?? 0) <= maximum);
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    assert.ok(total <= maximum);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
fs.mkdirSync(target);
const specs = [
  ["config.json", 547, "5664b325e6258d3960fad8c4c1cff958f3cc2272"],
  ["preprocessor_config.json", 436, "ff5b47c2edcd1d3556d63c01a65d93b58b9efce1"],
  ["README.md", 3033, "6b3380957df44ed203ec1d5102e1245accbbbba9"],
  [
    "model.safetensors",
    88249960,
    "ae1e99fcefd534ed978cdeb8326f08030c96e28b7a81ffcbc98a857c84d14be1",
  ],
];
const receipts = [];
for (const [name, size, identity] of specs) {
  const url = `https://huggingface.co/facebook/dinov2-small/resolve/${revision}/${name}`;
  const bytes = await download(url, size);
  assert.equal(bytes.length, size);
  const actual =
    identity.length === 64
      ? sha(bytes)
      : createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  assert.equal(actual, identity);
  fs.writeFileSync(path.join(target, name), bytes, { flag: "wx" });
  receipts.push({ name, url, bytes: bytes.length, sha256: sha(bytes) });
  console.log(`${name}: verified ${bytes.length} bytes`);
}
const licenseUrl = "https://raw.githubusercontent.com/facebookresearch/dinov2/main/LICENSE";
const license = await download(licenseUrl, 32000);
assert.ok(
  license.toString().includes("Apache License") && license.toString().includes("Version 2.0"),
);
fs.writeFileSync(path.join(target, "LICENSE"), license, { flag: "wx" });
receipts.push({ name: "LICENSE", url: licenseUrl, bytes: license.length, sha256: sha(license) });
fs.writeFileSync(
  path.join(target, "download-receipt.json"),
  JSON.stringify(
    {
      model: "facebook/dinov2-small",
      revision,
      downloadedAt: new Date().toISOString(),
      codeExecution: false,
      safetensorsOnly: true,
      receipts,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
