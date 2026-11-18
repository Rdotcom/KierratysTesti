import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { webSecurityHeaders } from "../lib/web-security.mjs";

test("web policy hashes trusted bootstrap scripts without permitting arbitrary inline/eval scripts", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "kig-web-security-"));
  try {
    const script = "window.fixture = true;";
    writeFileSync(
      path.join(directory, "index.html"),
      `<script>${script}</script><script src='/main.js'></script>`,
    );
    const headers = webSecurityHeaders(directory);
    const policy = headers["Content-Security-Policy"];
    assert.ok(policy.includes(`'sha256-${createHash("sha256").update(script).digest("base64")}'`));
    const scripts = policy.split(";").find((row) => row.trim().startsWith("script-src"));
    assert.doesNotMatch(scripts, /unsafe-inline|unsafe-eval|https:/u);
    assert.match(policy, /frame-ancestors 'none';?/u);
    assert.equal(headers["Referrer-Policy"], "no-referrer");
    assert.match(headers["Permissions-Policy"], /microphone=\(\)/u);
    for (const url of [
      "http://attacker.example",
      "https://user:secret@api.example.test",
      "https://api.example.test/path",
    ])
      assert.throws(() => webSecurityHeaders(directory, { EXPO_PUBLIC_API_BASE_URL: url }));
    assert.match(
      webSecurityHeaders(directory, { EXPO_PUBLIC_API_BASE_URL: "https://api.example.test" })[
        "Content-Security-Policy"
      ],
      /connect-src 'self' https:\/\/world.openfoodfacts.org https:\/\/api.example.test/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("web builds always produce deployment headers and unsafe serving is not used as production proof", () => {
  const mobile = JSON.parse(
    readFileSync(new URL("../../mobile/app/package.json", import.meta.url), "utf8"),
  );
  assert.equal(mobile.scripts.build, "node ../../scripts/build-web-secure.mjs");
  const build = readFileSync(new URL("../build-web-secure.mjs", import.meta.url), "utf8");
  assert.match(build, /EXPO_NO_DOTENV: "1"/u);
  assert.match(build, /write-web-security-headers/u);
  assert.match(build, /cwd: mobile, env, stdio/u);
  const server = readFileSync(new URL("../serve-web-secure.mjs", import.meta.url), "utf8");
  assert.match(server, /127\.0\.0\.1/u);
  assert.match(server, /isSymbolicLink/u);
  assert.match(server, /isContainedPath/u);
  assert.match(server, /endsWith\("\.map"\)/u);
});
