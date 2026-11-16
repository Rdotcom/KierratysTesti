// Explicit recovery of the one timed-out immutable model download, not inference retry.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = path.resolve(root, process.argv[2] ?? "");
assert(dir.startsWith(`${root}work/`) && fs.realpathSync(dir) === dir);
const receiptFile = path.join(dir, "download-receipt.json");
const receipt = JSON.parse(fs.readFileSync(receiptFile));
assert.equal(receipt.revision, "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2");
assert.equal(receipt.receipts.length, 6);
for (const row of receipt.receipts) {
  assert(/^[a-z_]+\.(json|md)$/i.test(row.name));
  const file = path.join(dir, row.name),
    stat = fs.lstatSync(file);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= 40_000_000 && stat.size === row.size,
  );
  assert.equal(createHash("sha256").update(fs.readFileSync(file)).digest("hex"), row.sha256);
}
const file = path.join(dir, "model.safetensors"),
  stat = fs.lstatSync(file),
  total = 1500800904;
assert(
  stat.isFile() &&
    !stat.isSymbolicLink() &&
    stat.nlink === 1 &&
    fs.realpathSync(file) === file &&
    stat.size > 0 &&
    stat.size < total,
);
const offset = stat.size,
  expected = "612923381c76ec5a9bed335d1c48827e3f2e506ac31b044b63b2031fadee6a0b";
fs.writeFileSync(
  path.join(dir, "resume-start.json"),
  JSON.stringify({
    offset,
    total,
    expectedSha256: expected,
    reason: "retained first300s timeout; explicit remaining-byte recovery",
  }),
  { flag: "wx" },
);
const url = `https://huggingface.co/google/siglip2-base-patch16-224/resolve/${receipt.revision}/model.safetensors`;
async function get(address, n = 0) {
  const u = new URL(address);
  assert(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === "huggingface.co" ||
        u.hostname.endsWith(".hf.co") ||
        u.hostname.endsWith(".huggingface.co")),
  );
  const r = await fetch(u, {
    redirect: "manual",
    headers: { Range: `bytes=${offset}-` },
    signal: AbortSignal.timeout(900000),
  });
  if (r.status >= 300 && r.status < 400) {
    assert(n < 5);
    await r.body?.cancel();
    return get(new URL(r.headers.get("location"), u).href, n + 1);
  }
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("content-range"), `bytes ${offset}-${total - 1}/${total}`);
  return r;
}
const response = await get(url),
  hash = createHash("sha256");
for await (const chunk of fs.createReadStream(file, { start: 0, end: offset - 1 }))
  hash.update(chunk);
const fd = fs.openSync(
  file,
  fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW,
);
assert.equal(fs.fstatSync(fd).size, offset);
let size = offset;
try {
  for await (const chunk of response.body) {
    size += chunk.length;
    assert(size <= total);
    hash.update(chunk);
    fs.writeSync(fd, chunk);
  }
} finally {
  fs.closeSync(fd);
}
assert.equal(size, total);
assert.equal(hash.digest("hex"), expected);
fs.writeFileSync(path.join(dir, "pre-resume-receipt.json"), JSON.stringify(receipt, null, 2), {
  flag: "wx",
});
receipt.receipts.push({ name: "model.safetensors", size: total, sha256: expected, url });
fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2));
console.log(`Completed remaining bytes; full ${total}-byte checkpoint SHA256 verified.`);
