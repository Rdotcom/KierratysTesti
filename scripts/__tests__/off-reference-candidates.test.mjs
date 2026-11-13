import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  candidateFromResponse,
  INITIAL_PRODUCT_CODES,
  prepareOffCandidates,
} from "../qa/reference-image/prepare-off-candidates.mjs";

// Synthetic API fixtures only; never accepted real source/product/image data.
const day = "2026-11-13";
function fixture(code = INITIAL_PRODUCT_CODES[0]) {
  return {
    status: 1,
    product: {
      code,
      product_name: "Synthetic product",
      brands: "Synthetic brand",
      quantity: "500 g",
      images: {
        1: { uploader: "synthetic-author", uploaded_t: 1_700_000_000 },
        2: { uploader: "synthetic-author", uploaded_t: "1700000010" },
        front_en: { imgid: "1" },
        front_fr: { imgid: 1 },
        front_fi: { imgid: "2" },
      },
    },
  };
}
const candidate = (value) =>
  candidateFromResponse(INITIAL_PRODUCT_CODES[0], value, "a".repeat(64), day);

test("committed source selection is traceable, unreviewed and never a shipped recognition gallery", () => {
  const data = JSON.parse(
    fs.readFileSync(
      new URL("../qa/reference-image/off-initial-selection.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(data.schemaVersion, "off-product-selection-v1");
  assert.equal(data.accessedOn, day);
  assert.deepEqual(
    data.products.map((item) => item.gtin),
    INITIAL_PRODUCT_CODES,
  );
  assert.equal(data.products.flatMap((item) => item.images).length, 21);
  assert.equal(data.integrationAllowed, false);
  assert.equal(data.humanAccepted, false);
  assert.equal(data.imagesDownloaded, 0);
  assert.equal(data.featureExtractions, 0);
  assert.equal(data.dataLicense, "ODbL-1.0");
  assert.equal(data.contentsLicense, "DbCL-1.0");
  assert.equal(data.proposedImageLicense, "CC-BY-SA-3.0");
  assert.ok(!("acceptance" in data));
  assert.ok(!("featureReceipts" in data));
  for (const product of data.products) {
    assert.match(product.responseSha256, /^[a-f0-9]{64}$/u);
    assert.equal(product.identityReview, "pending");
    assert.ok(!("label" in product));
    for (const image of product.images) {
      assert.equal(image.identityReview, "pending");
      assert.equal(image.rightsAndPrivacyReview, "pending");
      assert.equal(image.captureIndependence, "unverified");
      assert.equal(image.split, "unassigned");
      assert.match(
        image.imageUrl,
        /^https:\/\/openfoodfacts-images\.s3\.eu-west-3\.amazonaws\.com\/data\/\d{3}\/\d{3}\/\d{3}\/\d{4}\/\d+\.400\.jpg$/u,
      );
      assert.ok(!("capturedOn" in image));
      assert.ok(!("imageSha256" in image));
    }
  }
});

test("five selected public codes have valid GTIN-13 checksums, including similar Nutella SKUs", () => {
  assert.equal(INITIAL_PRODUCT_CODES.length, 5);
  assert.equal(new Set(INITIAL_PRODUCT_CODES).size, 5);
  for (const code of INITIAL_PRODUCT_CODES) {
    assert.match(code, /^\d{13}$/u);
    const sum = [...code].reduce(
      (total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
      0,
    );
    assert.equal(sum % 10, 0);
  }
  assert.ok(INITIAL_PRODUCT_CODES.includes("3017620422003"));
  assert.ok(INITIAL_PRODUCT_CODES.includes("4008400404127"));
});

test("selected crops/languages deduplicate by original upload, not false independent views", () => {
  const result = candidate(fixture());
  assert.equal(result.images.length, 2);
  assert.deepEqual(result.images[0].selectedViews, ["front_en", "front_fr"]);
  assert.equal(result.images[0].originalId, "1");
  assert.match(result.images[0].imageUrl, /\/301\/762\/042\/2003\/1\.400\.jpg$/u);
  assert.equal(result.images[0].captureIndependence, "unverified");
  assert.equal(result.images[0].split, "unassigned");
  assert.equal(result.images[0].rightsAndPrivacyReview, "pending");
  assert.equal(result.identityReview, "pending");
  assert.ok(!("capturedOn" in result.images[0]));
  assert.ok(!("featureReceipts" in result));
});

test("source identity, credit and upload dates must exist without manufactured fallbacks", () => {
  for (const edit of [
    (value) => {
      value.status = 0;
    },
    (value) => {
      value.product.code = "5449000000996";
    },
    (value) => {
      value.product.product_name = "";
    },
    (value) => {
      value.product.quantity = " ";
    },
    (value) => {
      value.product.brands = "bad\nbrand";
    },
    (value) => {
      value.product.images.front_en.imgid = "../private";
    },
    (value) => {
      delete value.product.images[1];
    },
    (value) => {
      value.product.images[1].uploader = "";
    },
    (value) => {
      value.product.images[1].uploaded_t = "NaN";
    },
    (value) => {
      value.product.images[1].uploaded_t = 9_000_000_000;
    },
    (value) => {
      delete value.product.images.front_en;
      delete value.product.images.front_fr;
      delete value.product.images.front_fi;
    },
  ]) {
    const value = fixture();
    edit(value);
    assert.throws(() => candidate(value));
  }
  assert.throws(() => candidateFromResponse("0000000000000", fixture(), "a".repeat(64), day));
  assert.throws(() => candidateFromResponse(INITIAL_PRODUCT_CODES[0], fixture(), "bad", day));
  assert.throws(() =>
    candidateFromResponse(INITIAL_PRODUCT_CODES[0], fixture(), "a".repeat(64), "2026-02-30"),
  );
});

test("acquisition is five serial bounded official API reads, zero images and no acceptance", async () => {
  let active = 0;
  let maximumActive = 0;
  const requests = [];
  const result = await prepareOffCandidates(async (url, options) => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    requests.push(url);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(options.headers["User-Agent"].includes("KierratysAppi"));
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://world.openfoodfacts.org");
    assert.equal(parsed.searchParams.get("fields"), "code,product_name,brands,quantity,images");
    const code = parsed.pathname.match(/product\/(\d+)\.json$/u)[1];
    await Promise.resolve();
    active--;
    return new Response(JSON.stringify(fixture(code)), { status: 200 });
  }, day);
  assert.equal(maximumActive, 1);
  assert.equal(requests.length, 5);
  assert.equal(result.products.length, 5);
  assert.equal(result.imagesDownloaded, 0);
  assert.equal(result.featureExtractions, 0);
  assert.equal(result.integrationAllowed, false);
  assert.equal(result.humanAccepted, false);
  assert.equal(result.proposedImageLicense, "CC-BY-SA-3.0");
  for (const product of result.products) assert.match(product.responseSha256, /^[a-f0-9]{64}$/u);
});

test("HTTP/redirect failures and oversized declared/streamed payloads never produce partial plans", async () => {
  for (const response of [
    new Response("denied", { status: 403 }),
    new Response("moved", { status: 302 }),
    new Response("{}", { headers: { "content-length": "524289" } }),
    new Response(" ".repeat(524_289)),
    new Response("not-json"),
  ]) {
    let calls = 0;
    await assert.rejects(
      prepareOffCandidates(async () => {
        calls++;
        return response;
      }, day),
    );
    assert.equal(calls, 1);
  }
});
