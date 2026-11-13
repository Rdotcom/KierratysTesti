import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Selection, not ground truth: five grocery SKUs including a deliberately
// similar pair. No images, features, scores or human acceptance are generated.
export const INITIAL_PRODUCT_CODES = Object.freeze([
  "3017620422003",
  "4008400404127",
  "5449000000996",
  "8076800195057",
  "7622210449283",
]);
const MAXIMUM_RESPONSE_BYTES = 524_288;
const fields = "code,product_name,brands,quantity,images";
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, limit = 160) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= limit &&
  value.trim() === value &&
  !/[\p{Cc}\p{Cf}]/u.test(value);

export function candidateFromResponse(code, response, responseSha256, accessedOn) {
  if (
    !INITIAL_PRODUCT_CODES.includes(code) ||
    !/^[a-f0-9]{64}$/u.test(responseSha256) ||
    !datePattern.test(accessedOn) ||
    !Number.isFinite(Date.parse(`${accessedOn}T00:00:00.000Z`)) ||
    new Date(`${accessedOn}T00:00:00.000Z`).toISOString().slice(0, 10) !== accessedOn ||
    !plain(response) ||
    response.status !== 1 ||
    !plain(response.product)
  )
    throw new Error("invalid_source_response");
  const product = response.product;
  if (
    product.code !== code ||
    !text(product.product_name) ||
    !text(product.brands, 240) ||
    !text(product.quantity) ||
    !plain(product.images) ||
    Object.keys(product.images).length > 1024
  )
    throw new Error("invalid_source_product");
  const fronts = Object.entries(product.images).filter(([key]) => /^front_[a-z]{2}$/u.test(key));
  // Parent IDs, not crop names/revisions/languages, define original uploads.
  const originals = new Map();
  for (const [key, selected] of fronts) {
    if (!plain(selected) || !/^[1-9]\d{0,5}$/u.test(String(selected.imgid)))
      throw new Error("invalid_selected_image");
    const originalId = String(selected.imgid);
    const original = product.images[originalId];
    if (!plain(original) || !text(original.uploader, 160))
      throw new Error("missing_original_attribution");
    const epoch = original.uploaded_t;
    if (
      !["number", "string"].includes(typeof epoch) ||
      !/^\d{1,12}$/u.test(String(epoch)) ||
      Number(epoch) <= 0 ||
      Number(epoch) > Date.parse(`${accessedOn}T23:59:59.999Z`) / 1000
    )
      throw new Error("invalid_upload_date");
    const existing = originals.get(originalId);
    if (existing) existing.selectedViews.push(key);
    else {
      const folder = code.replace(/^(...)(...)(...)(.*)$/u, "$1/$2/$3/$4");
      originals.set(originalId, {
        originalId,
        selectedViews: [key],
        sourceFamilyId: `off-${code}-upload-${originalId}`,
        authorCredit: `${original.uploader} / Open Food Facts`,
        uploadedOn: new Date(Number(epoch) * 1000).toISOString().slice(0, 10),
        // Upload time is not asserted to be capture time or independence.
        imageUrl: `https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/${folder}/${originalId}.400.jpg`,
        identityReview: "pending",
        rightsAndPrivacyReview: "pending",
        captureIndependence: "unverified",
        split: "unassigned",
      });
    }
  }
  if (originals.size < 1 || originals.size > 32) throw new Error("invalid_front_image_count");
  return {
    productId: `off-${code}`,
    gtin: code,
    sourceReportedName: product.product_name,
    sourceReportedBrands: product.brands,
    sourceReportedQuantity: product.quantity,
    sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
    responseSha256,
    accessedOn,
    identityReview: "pending",
    images: [...originals.values()],
  };
}

async function boundedResponse(response) {
  if (!response.ok || !response.body) throw new Error(`source_http_${response.status}`);
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAXIMUM_RESPONSE_BYTES)
  )
    throw new Error("source_response_bound");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAXIMUM_RESPONSE_BYTES) throw new Error("source_response_bound");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks, length);
}

export async function prepareOffCandidates(
  fetcher = fetch,
  accessedOn = new Date().toISOString().slice(0, 10),
) {
  const products = [];
  for (const code of INITIAL_PRODUCT_CODES) {
    const url = new URL(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
    url.searchParams.set("fields", fields);
    const response = await fetcher(url.href, {
      headers: {
        "User-Agent": "KierratysAppi/0.1 (research; https://github.com/roopeaal/KierratysAppi)",
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const bytes = await boundedResponse(response);
    products.push(
      candidateFromResponse(
        code,
        JSON.parse(bytes.toString("utf8")),
        createHash("sha256").update(bytes).digest("hex"),
        accessedOn,
      ),
    );
  }
  return {
    schemaVersion: "off-product-selection-v1",
    purpose: "unreviewed_reference_acquisition_plan",
    integrationAllowed: false,
    humanAccepted: false,
    imagesDownloaded: 0,
    featureExtractions: 0,
    dataLicense: "ODbL-1.0",
    contentsLicense: "DbCL-1.0",
    proposedImageLicense: "CC-BY-SA-3.0",
    attribution: "Product data: Open Food Facts contributors (community-reported, not verified).",
    licensingSource:
      "https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/",
    imageAcquisitionSource:
      "https://openfoodfacts.github.io/openfoodfacts-server/api/aws-images-dataset/",
    accessedOn,
    products,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3)
      throw new Error("usage: prepare-off-candidates.mjs work/<run>/off-candidates.json");
    const destination = path.resolve(process.argv[2]);
    const root = fs.realpathSync("work");
    const parent = fs.realpathSync(path.dirname(destination));
    if (
      !parent.startsWith(`${root}${path.sep}`) ||
      path.basename(destination) !== "off-candidates.json"
    )
      throw new Error("output_must_be_new_work_snapshot");
    const result = await prepareOffCandidates();
    fs.writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        output: destination,
        products: result.products.length,
        imagesDownloaded: 0,
        integrationAllowed: false,
      }),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "candidate_preparation_failed");
    process.exitCode = 1;
  }
}
