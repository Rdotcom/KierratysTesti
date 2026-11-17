// Local-only, owner-approved SDK/JDK installation. No global shell/profile edits.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const targets = [
  {
    name: "jdk.tar.gz",
    url: "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.13_9.tar.gz",
    algorithm: "sha256",
    hash: "bf036b35b071bfb2f54f2c0af8ee8d88afa95ee6eb3dce02c0f94cfc2524d04a",
  },
  {
    name: "sdk.zip",
    url: "https://dl.google.com/android/repository/commandlinetools-mac_x86_64-16111833_latest.zip",
    algorithm: "sha1",
    hash: "112cf9618794a997ff273537d55bee02c22abffe",
  },
];
for (const t of targets) {
  const out = path.join(run, t.name);
  assert(!fs.existsSync(out));
  const response = await fetch(t.url, { signal: AbortSignal.timeout(180000) });
  assert(response.ok && response.body);
  const fd = fs.openSync(out, "wx"),
    h = createHash(t.algorithm),
    sha = createHash("sha256");
  let size = 0;
  try {
    for await (const c of response.body) {
      size += c.length;
      assert(size < 400000000);
      h.update(c);
      sha.update(c);
      fs.writeSync(fd, c);
    }
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(h.digest("hex"), t.hash);
  console.log(
    JSON.stringify({
      file: t.name,
      bytes: size,
      sha256: sha.digest("hex"),
      officialDigestVerified: true,
    }),
  );
  const list = execFileSync(
    t.name.endsWith("zip") ? "/usr/bin/unzip" : "/usr/bin/tar",
    t.name.endsWith("zip") ? ["-Z1", out] : ["-tzf", out],
    { encoding: "utf8", maxBuffer: 3000000 },
  );
  for (const entry of list.trim().split("\n"))
    assert(!entry.startsWith("/") && !entry.split("/").includes(".."));
  const directory = path.join(run, t.name.startsWith("jdk") ? "jdk" : "sdk");
  fs.mkdirSync(directory);
  execFileSync(
    t.name.endsWith("zip") ? "/usr/bin/unzip" : "/usr/bin/tar",
    t.name.endsWith("zip") ? ["-q", out, "-d", directory] : ["-xzf", out, "-C", directory],
  );
}
const cmdline = path.join(run, "sdk/cmdline-tools");
assert(fs.existsSync(path.join(cmdline, "bin/sdkmanager")));
fs.mkdirSync(path.join(run, "android-sdk/cmdline-tools"), { recursive: true });
fs.renameSync(cmdline, path.join(run, "android-sdk/cmdline-tools/23.0"));
console.log(
  "Local verified toolchains installed. SDK license acceptance is a separate approved step.",
);
