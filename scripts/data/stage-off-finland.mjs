import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("tsup"))("esbuild");
await build({
  entryPoints: ["shared/contracts/src/barcode-library.ts"],
  outfile: path.join(run, "barcode-contract.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const { BarcodeLibrarySchema } = await import(
  pathToFileURL(path.join(run, "barcode-contract.mjs"))
);
await build({
  entryPoints: ["shared/domain/src/index.ts"],
  outfile: path.join(run, "gtin-contract.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const { GtinSchema } = await import(pathToFileURL(path.join(run, "gtin-contract.mjs")));
const safe = (v) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 240 && !/[\p{Cc}\p{Cf}]/u.test(v)
    ? v.trim()
    : undefined;
const records = new Map();
let rejected = 0,
  seen = 0;
const files = ["off-finland-source.json", "off-finland-source-2.json", "off-finland-source-3.json"];
for (const f of files) {
  if (!fs.existsSync(path.join(run, f))) {
    assert(f === "off-finland-source-2.json", "required_source_missing");
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(path.join(run, f)));
  assert(Array.isArray(raw.products) && raw.products.length <= 100);
  for (const p of raw.products) {
    seen++;
    const gtin = GtinSchema.safeParse(p.code),
      name = safe(p.product_name_fi) ?? safe(p.product_name_en) ?? safe(p.product_name);
    if (!gtin.success || !name || !p.countries_tags?.includes("en:finland")) {
      rejected++;
      continue;
    }
    const key = gtin.data.padStart(14, "0");
    if (!records.has(key))
      records.set(key, {
        gtin: gtin.data,
        name,
        names: {
          ...(safe(p.product_name_fi) ? { fi: safe(p.product_name_fi) } : {}),
          ...(safe(p.product_name_en) ? { en: safe(p.product_name_en) } : {}),
        },
        ...(safe(p.brands) ? { brands: safe(p.brands) } : {}),
      });
  }
}
const snapshot = BarcodeLibrarySchema.parse({
  schema: "off-finland-barcode-v1",
  checkedAt: new Date().toISOString().slice(0, 10),
  source: {
    name: "Open Food Facts contributors",
    licence: "ODbL-1.0 / DbCL-1.0",
    url: "https://world.openfoodfacts.org",
    scope: "source-tagged-sold-in-finland-not-complete-market",
  },
  products: [...records.values()].sort((a, b) => a.gtin.localeCompare(b.gtin)),
});
const text = JSON.stringify(snapshot);
fs.writeFileSync("mobile/app/assets/data/off-finland-barcodes.json", text, { flag: "wx" });
console.log(
  JSON.stringify({
    seen,
    products: snapshot.products.length,
    rejected,
    bytes: Buffer.byteLength(text),
    sha256: createHash("sha256").update(text).digest("hex"),
  }),
);
