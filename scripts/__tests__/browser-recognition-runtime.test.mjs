import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { browserRecognitionRuntime } from "../lib/browser-recognition-runtime.mjs";
test("Windows uses Scripts/python.exe and native paths even in directories containing spaces", () => {
  const result = browserRecognitionRuntime(
    "C:\\Users\\Student\\School Project",
    {},
    "win32",
    path.win32,
  );
  assert.equal(
    result.python,
    "C:\\Users\\Student\\School Project\\work\\siglip-server-venv\\Scripts\\python.exe",
  );
  assert.equal(result.assets, "C:\\Users\\Student\\School Project\\work\\network-model");
  assert.equal(result.webOrigin, "http://localhost:8097");
});
test("POSIX uses bin/python; overrides and separate ports are explicit", () => {
  const result = browserRecognitionRuntime(
    "/repo",
    {
      SIGLIP_PYTHON: "/runtime/python",
      SIGLIP_ASSETS: "/data/model",
      WEB_AI_PORT: "8098",
      SIGLIP_PORT: "3005",
    },
    "darwin",
    path.posix,
  );
  assert.equal(result.python, "/runtime/python");
  assert.equal(result.assets, "/data/model");
  assert.equal(result.apiOrigin, "http://127.0.0.1:3005");
  assert.equal(
    browserRecognitionRuntime("/repo", {}, "darwin", path.posix).python,
    "/repo/work/siglip-server-venv/bin/python",
  );
  for (const WEB_AI_PORT of ["bad", "0", "70000", "3004"])
    assert.throws(() => browserRecognitionRuntime("/repo", { WEB_AI_PORT }));
});
