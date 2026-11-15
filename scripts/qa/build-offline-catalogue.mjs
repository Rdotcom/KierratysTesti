// Reproducible bounded development import; no HTTP and no photo redistribution.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const planPath = "work/off-expansion-2026-11-14.KK6s7m/plan-v2/plan.json";
const allocationPath = "work/expanded-native-2026-11-14.jNduPd/continuation-freeze/lock.json";
function read(relative, expected) {
  const file = path.resolve(root, relative);
  if (
    !file.startsWith(`${root}work/`) ||
    fs.realpathSync(file) !== file ||
    !fs.lstatSync(file).isFile() ||
    fs.statSync(file).size > 8_000_000
  )
    throw Error("invalid_input");
  const bytes = fs.readFileSync(file);
  if (hash(bytes) !== expected) throw Error("input_drift");
  return bytes;
}
export function metadataFromPlan(plan, snapshots) {
  return plan.products.map((p) => {
    const raw = snapshots.find((s) => s.code === p.gtin)?.product;
    if (
      !raw ||
      raw.code !== p.gtin ||
      raw.product_name !== p.sourceReportedName ||
      raw.brands !== p.sourceReportedBrands ||
      raw.quantity !== p.sourceReportedQuantity
    )
      throw Error("source_mismatch");
    return {
      id: p.productId,
      gtins: [p.gtin],
      name: raw.product_name,
      brands: raw.brands,
      quantity: raw.quantity,
      manufacturer: null,
      variant: null,
      category: null,
      packaging: null,
      market: null,
      packagingVersion: null,
      createdOn: p.accessedOn,
      updatedOn: p.accessedOn,
      source: {
        publisher: "Open Food Facts contributors",
        url: p.sourceUrl,
        checkedOn: p.accessedOn,
        snapshotSha256: p.snapshotSha256,
        licence: "ODbL-1.0 database / DbCL-1.0 contents",
        verificationStatus: "source_asserted",
      },
    };
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [binaryPath, outputPath] = process.argv.slice(2);
  if (!binaryPath || !outputPath) throw Error("usage: binary work/new-output");
  const binary = path.resolve(root, binaryPath),
    output = path.resolve(root, outputPath);
  if (
    !binary.startsWith(`${root}work/`) ||
    fs.realpathSync(binary) !== binary ||
    !output.startsWith(`${root}work/`) ||
    fs.existsSync(output)
  )
    throw Error("invalid_scope_or_existing_output");
  const parent = path.dirname(output);
  if (fs.realpathSync(parent) !== parent) throw Error("invalid_parent");
  const plan = JSON.parse(
    read(planPath, "7618f1876275d01aeb80a5401dea0bf903021cd28027358f9136fae84eebb86f"),
  );
  const allocation = JSON.parse(
    read(allocationPath, "efdf65ee638595cedc176029138194afc8e10b20920ad0003c897c7444dfa67e"),
  );
  const snapshots = plan.requests.map((r) => ({
    code: r.code,
    ...JSON.parse(read(r.file, r.sha256)),
  }));
  const products = metadataFromPlan(plan, snapshots);
  const rows = allocation.rows.filter((r) => r.allocationRole === "reference");
  if (rows.length !== 10 || products.length !== 5) throw Error("unexpected_selection");
  fs.mkdirSync(output);
  const receipts = [],
    references = [];
  fs.writeFileSync(
    path.join(output, "started.json"),
    JSON.stringify({
      binarySha256: hash(fs.readFileSync(binary)),
      planPath,
      allocationPath,
      references: rows.map((r) => r.id),
    }),
    { flag: "wx" },
  );
  let identity;
  for (const row of rows) {
    const bytes = read(row.file, row.imageSha256);
    const started = performance.now();
    const result = spawnSync(
      "/usr/bin/sandbox-exec",
      [
        "-p",
        "(version 1)(allow default)(deny network*)",
        binary,
        "--resources",
        "work/mobileclip-candidate-2026-11-06.M305AS/KierratysLocalVisionModels.bundle",
        "--reference-encode-stdin",
      ],
      {
        cwd: root,
        input: bytes.toString("base64"),
        encoding: "utf8",
        timeout: 20000,
        killSignal: "SIGKILL",
        maxBuffer: 262144,
        env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
      },
    );
    const receipt = {
      id: row.id,
      imageSha256: row.imageSha256,
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
      wallMs: performance.now() - started,
    };
    receipts.push(receipt);
    fs.writeFileSync(path.join(output, `${row.id}.json`), JSON.stringify(receipt), { flag: "wx" });
    if (result.status !== 0 || result.error) throw Error("native_encode_failed");
    const raw = JSON.parse(result.stdout);
    if (raw.imageSha256 !== row.imageSha256 || raw.vector?.length !== 512)
      throw Error("invalid_native_embedding");
    identity ??= { encoderSha256: raw.encoderSha256, preprocessingSha256: raw.preprocessingSha256 };
    if (
      identity.encoderSha256 !== raw.encoderSha256 ||
      identity.preprocessingSha256 !== raw.preprocessingSha256
    )
      throw Error("encoder_drift");
    references.push({
      id: row.id,
      productId: row.productId,
      imageSha256: row.imageSha256,
      vector: raw.vector,
      familyId: row.familyId,
      source: {
        publisher: row.source.publisher,
        url: row.source.url,
        checkedOn: row.source.checkedOn,
        snapshotSha256: row.source.snapshotSha256,
        licence: "CC-BY-SA-3.0 derived image descriptors",
        verificationStatus: "source_asserted",
      },
    });
  }
  const catalogue = {
    schemaVersion: "offline-catalogue-v1",
    version: "off-five-2026-11-14-v1",
    ...identity,
    products,
    references,
  };
  const serialized = `${JSON.stringify(catalogue, null, 2)}\n`;
  fs.writeFileSync(path.join(output, "catalogue.json"), serialized, { flag: "wx" });
  fs.writeFileSync(
    path.join(output, "receipt.json"),
    JSON.stringify({
      catalogueSha256: hash(serialized),
      catalogueBytes: Buffer.byteLength(serialized),
      references: rows.length,
      products: products.length,
      networkPolicy: "sandbox-exec deny network*",
      calls: receipts.length,
      sourceAssertionsOnly: true,
    }),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      output: path.relative(root, output),
      products: products.length,
      references: rows.length,
    }),
  );
}
