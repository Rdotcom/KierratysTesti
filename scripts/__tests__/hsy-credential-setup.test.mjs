import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  credentialFileName,
  saveHsyCredentials,
  serializeHsyCredentials,
} from "../setup-hsy-credentials.mjs";
const id = "00000000-0000-4000-8000-000000000001",
  sample = "synthetic-test-only-not-a-credential";
test("PROD uses a separate fixed credential file; caller cannot supply a path", () => {
  assert.equal(credentialFileName([]), ".env.hsy.local");
  assert.equal(credentialFileName(["--prod"]), ".env.hsy.prod.local");
  for (const args of [["../other"], ["--prod", "extra"], ["--dev"], null])
    assert.throws(() => credentialFileName(args));
});
test("dedicated provider env serialization is bounded and excludes shell/control injection", () => {
  assert.equal(
    serializeHsyCredentials(id, sample),
    `HSY_CLIENT_ID=${id}\nHSY_CLIENT_SECRET=${sample}\n`,
  );
  for (const value of [
    "",
    null,
    "x".repeat(257),
    "bad\nANOTHER=field",
    "untrusted$(command)",
    "untrusted'quotevalue",
  ])
    assert.throws(() => serializeHsyCredentials(id, value), /invalid_client_secret/);
  assert.throws(() => serializeHsyCredentials("not-an-id", sample), /invalid_client_id/);
});
test("provider file is private and existing files/symlinks cannot be overwritten", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kig-hsy-setup-")),
    target = path.join(dir, ".env.hsy.local"),
    link = path.join(dir, "link");
  try {
    saveHsyCredentials(target, "synthetic-fixture");
    assert.equal(fs.statSync(target).mode & 0o777, 0o600);
    assert.throws(() => saveHsyCredentials(target, "changed"), { code: "EEXIST" });
    assert.equal(fs.readFileSync(target, "utf8"), "synthetic-fixture");
    fs.symlinkSync(target, link);
    assert.throws(() => saveHsyCredentials(link, "changed"));
  } finally {
    // Exact files created by this test only; no recursive target or traversal.
    if (fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(link);
    if (fs.lstatSync(target, { throwIfNoEntry: false })?.isFile()) fs.unlinkSync(target);
    fs.rmdirSync(dir);
  }
});
test("private input has no network/clipboard/secret logging and requires a TTY", () => {
  const source = fs.readFileSync("scripts/setup-hsy-credentials.mjs", "utf8");
  assert.match(source, /setRawMode\(true\)/);
  assert.match(source, /process\.stdin\.isTTY/);
  assert.doesNotMatch(
    source,
    /fetch\(|https?:|clipboard\.|pbpaste|console\.(?:log|error)\([^\n]*(?:\bid\b|\bsecret\b|\bcontent\b)/,
  );
  assert.match(source, /\.env\.hsy\.local/);
  assert.match(source, /check-ignore/);
});
