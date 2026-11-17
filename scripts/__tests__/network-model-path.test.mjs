import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { isContainedPath } from "../lib/contained-path.mjs";
test("model staging containment respects Windows separators, case and drive boundaries", () => {
  const root = "C:\\Users\\Student\\Project\\work";
  assert.equal(isContainedPath(root, "C:\\Users\\Student\\Project\\work\\model", path.win32), true);
  assert.equal(isContainedPath(root, "c:\\users\\student\\project\\work\\model", path.win32), true);
  for (const target of [
    root,
    "C:\\Users\\Student\\Project\\work-old\\model",
    "C:\\Users\\Student\\Project\\work\\..\\private",
    "D:\\model",
  ])
    assert.equal(isContainedPath(root, target, path.win32), false);
});
test("model staging containment retains POSIX traversal and exact-root rejection", () => {
  assert.equal(isContainedPath("/repo/work", "/repo/work/model", path.posix), true);
  for (const target of [
    "/repo/work",
    "/repo/work-old/model",
    "/repo/work/../private",
    "/other/model",
  ])
    assert.equal(isContainedPath("/repo/work", target, path.posix), false);
});
