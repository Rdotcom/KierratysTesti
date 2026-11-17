import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) => readFileSync(join(root, file), "utf8");
function filesIn(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    assert.equal(entry.isSymbolicLink(), false);
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}

test("current documentation stays focused on app setup, architecture, data and maintenance", () => {
  const files = filesIn("docs").filter((file) => file.endsWith(".md"));
  assert.equal(files.length, 11);
  for (const file of files) assert.ok(read(file).split("\n").length < 150, file);
  assert.equal(existsSync(join(root, "docs/final/ASSESSMENT_READY.md")), false);
  for (const file of files) assert.doesNotMatch(file, /^docs\/(?:final|research|design)\//u);
});

test("current README and documentation links resolve without relying on removed reports", () => {
  for (const file of [
    "README.md",
    "SECURITY.md",
    "mobile/README.md",
    "backend/README.md",
    "shared/README.md",
    ...filesIn("docs"),
  ]) {
    if (!file.endsWith(".md")) continue;
    for (const match of read(file).matchAll(/\[[^\]]*\]\(([^\s)]+)\)/gu)) {
      const link = match[1];
      if (/^(?:[a-z]+:|#)/iu.test(link)) continue;
      const relative = decodeURIComponent(link.split("#")[0]);
      assert.ok(existsSync(resolve(root, dirname(file), relative)), `${file}: ${link}`);
    }
  }
});

test("relocated QA protocols retain all original byte hashes and archive provenance", () => {
  assert.match(read(".gitattributes"), /^scripts\/qa\/protocols\/\* text eol=lf$/mu);
  const manifest = JSON.parse(read("scripts/qa/protocols/manifest.json"));
  assert.equal(manifest.files.length, 38);
  assert.equal(manifest.source, "2148d4e79aa916c687ef0326aaa29d2c75f321b1");
  assert.equal(manifest.archiveCommit, "21e27aa124c07b4f37350e4961342a5e710dde18");
  assert.equal(new Set(manifest.files.map((row) => row.file)).size, 38);
  for (const row of manifest.files) {
    assert.match(row.file, /^[a-z0-9.-]+\.(?:md|json)$/u);
    assert.match(row.original, /^docs\/(?:final|research)\//u);
    const file = join(root, "scripts/qa/protocols", row.file);
    assert.equal(lstatSync(file).isFile(), true);
    assert.equal(lstatSync(file).isSymbolicLink(), false);
    assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), row.sha256);
  }
});

test("cleanup retains full validation, audit and the three ownership boundaries", () => {
  const scripts = JSON.parse(read("package.json")).scripts;
  assert.match(scripts.test, /scripts\/__tests__\/\*\.test\.mjs/u);
  assert.match(scripts.validate, /pnpm check:boundaries.*pnpm test.*pnpm build/u);
  assert.equal(scripts["security:audit"], "node scripts/audit-policy.mjs");
  for (const area of ["mobile", "backend", "shared"]) {
    assert.ok(existsSync(join(root, area, "AGENTS.md")));
    assert.ok(existsSync(join(root, area, "README.md")));
  }
  assert.match(read(".github/workflows/ci.yml"), /pnpm security:audit/u);
});
