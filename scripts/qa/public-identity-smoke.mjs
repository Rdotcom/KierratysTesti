// Exactly one public food-code GET, no account, owner data, retries or paid calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
assert(!fs.existsSync(path.join(run, "public-smoke.json")), "no_automatic_repeat");
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("tsup"))("esbuild");
const out = path.join(run, "public-lookup.mjs");
await build({
  entryPoints: ["mobile/app/src/features/scan/public-identity-lookup.ts"],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
});
const { createPublicIdentityLookup } = await import(pathToFileURL(out));
const calls = [];
const result = await createPublicIdentityLookup(async (url, init) => {
  assert.equal(calls.length, 0);
  const response = await fetch(url, init);
  calls.push({ status: response.status, contentType: response.headers.get("content-type") });
  return response;
})("5449000000996", "fi");
fs.writeFileSync(
  path.join(run, "public-smoke.json"),
  JSON.stringify(
    {
      calls,
      status: result.status,
      productName: result.product?.name?.value,
      community: result.product?.name?.provenance.verificationStatus,
      licence: result.product?.name?.provenance.license.id,
      noSortingFromIdentity: !result.product?.packagingComponents.length,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
assert.equal(result.status, "packaging_missing", "public_identity_not_resolved");
assert.equal(result.product.name?.provenance.verificationStatus, "community");
console.log(
  "One public food-code identity resolved with community provenance; no material inferred.",
);
