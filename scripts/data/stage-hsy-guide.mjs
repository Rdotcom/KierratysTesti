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
  entryPoints: ["shared/recycling-engine/src/guide-library.ts"],
  outfile: path.join(run, "stage-contract.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
});
const { GuideLibrarySchema } = await import(pathToFileURL(path.join(run, "stage-contract.mjs")));
const source = fs.readFileSync(path.join(run, "hsy-guide.json")),
  data = GuideLibrarySchema.parse(
    JSON.parse(source, (_key, value) =>
      typeof value === "string" ? value.replace(/(?![\n\t])[\p{Cc}\p{Cf}]/gu, "") : value,
    ),
  );
let removedEditorMarkers = 0;
const clean = (s) =>
  s
    .replace(/Prosessilohko\s+eng\s*:[^\n]*/gi, () => {
      removedEditorMarkers++;
      return "";
    })
    .replace(/Prosessilohko(?:\s+(?:FI|EN|SV))?\s*:\s*/gi, () => {
      removedEditorMarkers++;
      return "";
    });
for (const row of data.items)
  for (const language of ["fi", "en"]) {
    const t = row[language];
    t.instructions = clean(t.instructions);
    for (const r of [...t.wasteTypes, ...t.receivers]) r.description = clean(r.description);
  }
// Explicit UI-label translations only; no changed sorting advice or new rule.
for (const row of data.items) {
  if (row.en.title === "Eristevilla (ekovilla)") row.en.title = "Insulation wool (ecowool)";
  row.en.title = row.en.title.replace(/\s*\(pakkaustäytteet\)\s*$/u, "");
}
data.version = data.version.replace(/\.1$/, ".2");
const text = JSON.stringify(GuideLibrarySchema.parse(data));
assert(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === "--write"));
const target = "mobile/app/assets/data/hsy-guide.json";
if (fs.existsSync(target))
  assert(!fs.lstatSync(target).isSymbolicLink() && fs.lstatSync(target).isFile());
fs.writeFileSync(target, text, { flag: process.argv[3] === "--write" ? "w" : "wx" });
console.log(
  JSON.stringify({
    items: data.items.length,
    bytes: Buffer.byteLength(text),
    sha256: createHash("sha256").update(text).digest("hex"),
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    removedEditorMarkers,
    englishIncomplete: data.items.filter((i) => i.en.translationIncomplete).length,
  }),
);
