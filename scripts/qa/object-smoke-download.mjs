// Fixed official SigLIP2 checkpoint; local safetensors, never remote Python.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const target = path.resolve(root, process.argv[2] ?? "");
assert(target.startsWith(`${root}work/`) && !fs.existsSync(target));
assert.equal(fs.realpathSync(path.dirname(target)), path.dirname(target));
const revision = "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2";
async function response(address, redirects = 0) {
  const u = new URL(address);
  assert(u.protocol === "https:" && !u.username && !u.password && !u.port);
  assert(
    u.hostname === "huggingface.co" ||
      u.hostname.endsWith(".hf.co") ||
      u.hostname.endsWith(".huggingface.co"),
  );
  const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(300000) });
  if (r.status >= 300 && r.status < 400) {
    assert(redirects < 5);
    await r.body?.cancel();
    return response(new URL(r.headers.get("location"), u).href, redirects + 1);
  }
  assert.equal(r.status, 200);
  return r;
}
const metaResponse = await response(
  `https://huggingface.co/api/models/google/siglip2-base-patch16-224/revision/${revision}?blobs=true`,
);
const metaBytes = Buffer.from(await metaResponse.arrayBuffer());
assert(metaBytes.length < 1_000_000);
const metadata = JSON.parse(metaBytes);
assert.equal(metadata.sha, revision);
assert.equal(metadata.cardData.license, "apache-2.0");
const names = [
  "config.json",
  "preprocessor_config.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "README.md",
  "model.safetensors",
];
const specs = names.map((name) => {
  const r = metadata.siblings.find((r) => r.rfilename === name);
  assert(r && r.size > 0);
  return r;
});
assert(specs.reduce((s, r) => s + r.size, 0) <= 1_550_000_000);
assert.equal(
  specs.at(-1).lfs.sha256,
  "612923381c76ec5a9bed335d1c48827e3f2e506ac31b044b63b2031fadee6a0b",
);
fs.mkdirSync(target, { mode: 0o700 });
fs.writeFileSync(path.join(target, "source-metadata.json"), metaBytes, { flag: "wx" });
const receipts = [];
for (const spec of specs) {
  const url = `https://huggingface.co/google/siglip2-base-patch16-224/resolve/${revision}/${spec.rfilename}`;
  const r = await response(url);
  assert(Number(r.headers.get("content-length") ?? 0) <= spec.size);
  const fd = fs.openSync(path.join(target, spec.rfilename), "wx", 0o600);
  const hash = createHash("sha256"),
    git = createHash("sha1").update(`blob ${spec.size}\0`);
  let size = 0;
  try {
    for await (const bytes of r.body) {
      size += bytes.length;
      assert(size <= spec.size);
      hash.update(bytes);
      git.update(bytes);
      fs.writeSync(fd, bytes);
    }
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(size, spec.size);
  const sha256 = hash.digest("hex"),
    gitSha1 = git.digest("hex");
  assert.equal(spec.lfs ? sha256 : gitSha1, spec.lfs?.sha256 ?? spec.blobId);
  receipts.push({ name: spec.rfilename, size, sha256, url });
  fs.writeFileSync(
    path.join(target, "download-receipt.json"),
    JSON.stringify({ revision, license: "apache-2.0", receipts }, null, 2),
  );
  console.log(`${spec.rfilename}: verified ${size} bytes`);
}
