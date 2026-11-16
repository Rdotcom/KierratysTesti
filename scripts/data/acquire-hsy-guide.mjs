// Owner-authorized free source acquisition. Credentials only in process/header,
// never arguments, log values, query strings, raw receipts or mobile data.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
assert(!fs.existsSync(path.join(run, "hsy-guide.json")), "no_automatic_repeat");
assert(process.env.HSY_CLIENT_ID && process.env.HSY_CLIENT_SECRET, "missing_private_credentials");
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("tsup"))("esbuild");
await build({
  entryPoints: ["backend/data-providers/src/hsy-guide.ts"],
  outfile: path.join(run, "hsy-adapter.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const { normalizeHsyPage } = await import(pathToFileURL(path.join(run, "hsy-adapter.mjs")));
await build({
  entryPoints: ["shared/recycling-engine/src/guide-library.ts"],
  outfile: path.join(run, "hsy-contract.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const { GuideLibrarySchema, GuideTranslationSchema } = await import(
  pathToFileURL(path.join(run, "hsy-contract.mjs"))
);
const reuse = process.argv[3] ? path.resolve(root, process.argv[3]) : undefined;
if (reuse) assert(reuse.startsWith(`${root}/work/`) && fs.realpathSync(reuse) === reuse);
const receipt = [];
let bytes = 0;
async function load(language) {
  const all = new Map();
  let count,
    seen = 0,
    duplicates = 0;
  for (let page = 1; page <= 20; page++) {
    const cached = reuse ? path.join(reuse, `hsy-${language}-page-${page}.json`) : undefined;
    let normalized;
    if (cached && fs.existsSync(cached)) {
      const source = JSON.parse(fs.readFileSync(cached));
      normalized = {
        totalCount: source.totalCount,
        items: source.items.map(({ id, ...rest }) => ({
          id,
          ...GuideTranslationSchema.parse(rest),
        })),
      };
      receipt.push({
        language,
        page,
        cached: true,
        items: normalized.items.length,
        total: normalized.totalCount,
      });
    } else {
      const url = new URL("https://prod.klapi.hsy.fi/int2001/v1/waste-guide-api/waste-pages");
      for (const [k, v] of Object.entries({ lang: language, page: String(page), pageSize: "100" }))
        url.searchParams.set(k, v);
      const r = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: "application/json",
          client_id: process.env.HSY_CLIENT_ID,
          client_secret: process.env.HSY_CLIENT_SECRET,
        },
      });
      receipt.push({ language, page, status: r.status });
      assert(
        r.ok && r.body && r.headers.get("content-type")?.includes("json"),
        "hsy_page_unavailable",
      );
      const chunks = [];
      let size = 0;
      for await (const c of r.body) {
        size += c.length;
        bytes += c.length;
        assert(size <= 2_000_000 && bytes <= 20_000_000, "bound_source_bytes");
        chunks.push(c);
      }
      normalized = normalizeHsyPage(JSON.parse(Buffer.concat(chunks).toString()));
      const encodedPage = JSON.stringify(normalized);
      assert(!encodedPage.includes(process.env.HSY_CLIENT_SECRET), "no_credential_reflection");
      fs.writeFileSync(path.join(run, `hsy-${language}-page-${page}.json`), encodedPage, {
        flag: "wx",
      });
      Object.assign(receipt.at(-1), {
        items: normalized.items.length,
        total: normalized.totalCount,
        firstId: normalized.items[0]?.id,
        lastId: normalized.items.at(-1)?.id,
      });
    }
    if (count === undefined) count = normalized.totalCount;
    assert.equal(count, normalized.totalCount, "stable_source_count");
    for (const row of normalized.items) {
      seen++;
      if (all.has(row.id)) {
        assert.deepEqual(all.get(row.id), row, "conflicting_source_id");
        duplicates++;
        continue;
      }
      all.set(row.id, row);
    }
    if (seen === count) return { entries: all, total: count, seen, duplicates };
    assert(seen < count, "source_count_exceeded");
    assert(normalized.items.length > 0, "premature_empty_page");
  }
  throw Error("pagination_bound");
}
try {
  const finnish = await load("fi"),
    english = await load("en"),
    fi = finnish.entries,
    en = english.entries;
  assert(fi.size > 100);
  const checkedAt = new Date().toISOString().slice(0, 10);
  const untranslated = [];
  const items = [...fi.values()]
    .filter((row) => {
      if (en.has(row.id)) return true;
      untranslated.push(row.id);
      return false;
    })
    .map((row) => {
      const english = en.get(row.id);
      assert(english, "translation_id_join");
      const { id, ...f } = row;
      const { id: _id, ...e } = english;
      return { id, fi: f, en: e };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const result = GuideLibrarySchema.parse({
    schema: "hsy-offline-guide-v1",
    version: `hsy-prod-1.0.4-${checkedAt}.1`,
    checkedAt,
    jurisdiction: "FI-HSY",
    source: {
      name: "HSY",
      url: "https://www.hsy.fi/jateopas",
      apiVersion: "1.0.4",
      licence: "CC-BY-4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    },
    items,
  });
  const encoded = JSON.stringify(result);
  assert(Buffer.byteLength(encoded) <= 6_000_000, "snapshot_size");
  fs.writeFileSync(path.join(run, "hsy-guide.json"), encoded, { flag: "wx" });
  fs.writeFileSync(
    path.join(run, "hsy-acquisition.json"),
    JSON.stringify(
      {
        receipt,
        items: items.length,
        bytes: Buffer.byteLength(encoded),
        sha256: createHash("sha256").update(encoded).digest("hex"),
        rawSourceBytes: bytes,
        sourceCounts: { fi: finnish.total, en: english.total },
        duplicates: { fi: finnish.duplicates, en: english.duplicates },
        untranslated,
        englishOnly: [...en.keys()].filter((id) => !fi.has(id)),
        coverage: "observed-source-pages-not-guaranteed-exhaustive",
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  console.log(`HSY source snapshot: ${items.length} FI/EN records; no credential output.`);
} catch (error) {
  fs.writeFileSync(
    path.join(run, "hsy-failed.json"),
    JSON.stringify({
      receipt,
      bytes,
      success: false,
      code: error?.code ?? error?.name,
      issues: Array.isArray(error?.issues)
        ? error.issues.map((i) => ({ path: i.path, code: i.code }))
        : undefined,
      reason: error?.name === "AssertionError" ? String(error.message).split("\n")[0] : undefined,
    }),
    { flag: "wx" },
  );
  console.error("HSY import refused; failure metadata retained without secrets or response body.");
  process.exitCode = 1;
}
