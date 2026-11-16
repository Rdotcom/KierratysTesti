// One bounded public search (a few hundred records, not a bulk API crawl).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
const page = Number(process.argv[3] ?? 1);
assert(Number.isInteger(page) && page >= 1 && page <= 3);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
assert(!fs.existsSync(path.join(run, `off-finland-source-${page}.json`)));
const url = new URL("https://world.openfoodfacts.org/api/v2/search");
for (const [k, v] of Object.entries({
  countries_tags: "en:finland",
  fields: "code,product_name,product_name_fi,product_name_en,brands,countries_tags",
  page_size: "100",
  page: String(page),
  sort_by: "unique_scans_n",
}))
  url.searchParams.set(k, v);
const r = await fetch(url, {
  redirect: "error",
  signal: AbortSignal.timeout(30000),
  headers: {
    Accept: "application/json",
    "User-Agent": "KeepItGreen/0.1 (https://github.com/roopeaal/KierratysAppi)",
  },
});
assert(r.ok && r.body && r.headers.get("content-type")?.includes("json"));
const chunks = [];
let size = 0;
for await (const c of r.body) {
  size += c.length;
  assert(size <= 2_000_000);
  chunks.push(c);
}
const bytes = Buffer.concat(chunks),
  json = JSON.parse(bytes.toString());
assert(Array.isArray(json.products) && json.products.length > 0 && json.products.length <= 300);
fs.writeFileSync(path.join(run, `off-finland-source-${page}.json`), bytes, { flag: "wx" });
fs.writeFileSync(
  path.join(run, `off-acquisition-${page}.json`),
  JSON.stringify(
    {
      url: url.href,
      status: r.status,
      records: json.products.length,
      bytes: size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(`Public Finland source: ${json.products.length} records, ${size} bytes.`);
