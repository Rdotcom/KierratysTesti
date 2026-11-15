import { describe, expect, it } from "vitest";
import { createOfflineCatalogue, offlineEncoder } from "../offline-product";

const v = (axis = 0) => Array.from({ length: 512 }, (_, i) => Number(i === axis));
const source = {
  publisher: "Test fixture, not real product data",
  url: "https://example.com/test",
  checkedOn: "2026-11-14",
  snapshotSha256: "a".repeat(64),
  licence: "test-only",
  verificationStatus: "source_asserted",
};
const p = (id: string, gtin: string, quantity: string) => ({
  id,
  gtins: [gtin],
  name: "Example Original",
  brands: "Example",
  quantity,
  manufacturer: null,
  variant: null,
  category: null,
  packaging: null,
  market: null,
  packagingVersion: null,
  createdOn: "2026-11-14",
  updatedOn: "2026-11-14",
  source,
});
const fixture = () => ({
  schemaVersion: "offline-catalogue-v1",
  version: "fixture-v1",
  ...offlineEncoder,
  products: [p("a", "3017620422003", "400 g"), p("b", "4008400404127", "750 g")],
  references: [
    {
      id: "a1",
      productId: "a",
      imageSha256: "b".repeat(64),
      vector: v(),
      familyId: "fixture-a1",
      source,
    },
    {
      id: "a2",
      productId: "a",
      imageSha256: "c".repeat(64),
      vector: v(),
      familyId: "fixture-a2",
      source,
    },
    {
      id: "b1",
      productId: "b",
      imageSha256: "d".repeat(64),
      vector: v(1),
      familyId: "fixture-b1",
      source,
    },
  ],
});
const runtime = () => {
  const r = createOfflineCatalogue(fixture());
  if (!r) throw Error("invalid_test_fixture");
  return r;
};
describe("offline catalogue integrity and barcode lookup", () => {
  it("keeps exact source mapping, independent product id and unverified source", () => {
    expect(runtime().lookup(["3017620422003"])).toMatchObject({
      status: "catalogue_match",
      product: { id: "a", source: { verificationStatus: "source_asserted" } },
      evidence: "barcode",
    });
    expect(runtime().lookup(["03017620422003"])).toMatchObject({
      status: "catalogue_match",
      product: { id: "a" },
    });
  });
  it("deduplicates equivalent GTIN representations but refuses two products", () => {
    expect(runtime().lookup(["3017620422003", "03017620422003"]).status).toBe("catalogue_match");
    expect(runtime().lookup(["3017620422003", "4008400404127"]).status).toBe("ambiguous_barcode");
  });
  it("preserves a valid absent GTIN, never guesses its product", () => {
    expect(runtime().lookup(["5449000000996"])).toEqual({
      status: "product_not_in_catalogue",
      gtin: "5449000000996",
    });
  });
  it.each([
    "",
    "3017620422004",
    "https://example.com/3017620422003",
    "３０１７６２０４２２００３",
    "3017 620422003",
  ])("rejects noncanonical camera payload %s", (s) => {
    expect(runtime().lookup([s]).status).toBe("invalid_barcode");
  });
  it("allows existing manual formatting without weakening camera checks", () => {
    expect(runtime().lookup(["3017 620422003"], "manual").status).toBe("catalogue_match");
  });
  it("fails closed on empty, overbound or corrupt catalogue and alias collisions", () => {
    expect(createOfflineCatalogue({})).toBeNull();
    const c = fixture();
    c.products[1] = p("b", "03017620422003", "750 g");
    expect(createOfflineCatalogue(c)).toBeNull();
    expect(runtime().lookup([]).status).toBe("invalid_barcode");
    expect(runtime().lookup(Array(9).fill("3017620422003")).status).toBe("invalid_barcode");
  });
  it("owns input and output, leaving previous version valid on replacement failure", () => {
    const c = fixture(),
      r = createOfflineCatalogue(c);
    if (!r) throw Error("fixture");
    c.products[0] = p("changed", "3017620422003", "900 g");
    const first = r.lookup(["3017620422003"]);
    if (first.status !== "catalogue_match") throw Error("fixture");
    first.product.name = "mutated";
    expect(r.lookup(["3017620422003"])).toMatchObject({
      product: { id: "a", name: "Example Original" },
    });
    expect(createOfflineCatalogue({ ...c, version: null })).toBeNull();
    expect(r.count).toBe(2);
  });
  it("rejects model mismatch, dangling references and malformed vectors", () => {
    expect(createOfflineCatalogue({ ...fixture(), encoderSha256: "0".repeat(64) })).toBeNull();
    const c = fixture();
    const first = c.references[0];
    if (!first) throw Error("fixture");
    c.references[0] = { ...first, productId: "missing" };
    expect(createOfflineCatalogue(c)).toBeNull();
    expect(runtime().rank(v(), "0".repeat(64), offlineEncoder.preprocessingSha256)).toBeNull();
    expect(
      runtime().rank(
        Array(512).fill(0),
        offlineEncoder.encoderSha256,
        offlineEncoder.preprocessingSha256,
      ),
    ).toBeNull();
  });
  it("aggregates actual vectors by SKU, not by reference count; ranking never accepts", () => {
    expect(
      runtime().rank(v(), offlineEncoder.encoderSha256, offlineEncoder.preprocessingSha256),
    ).toEqual([
      { productId: "a", cosine: 1 },
      { productId: "b", cosine: 0 },
    ]);
    expect(runtime().suggest([], [], ["a", "b"])).toEqual({ status: "unknown" });
  });
  it("requires full name plus exact size plus ranked support, still only suggests", () => {
    expect(runtime().suggest(["Example Original", "400 g"], [], ["a"])).toMatchObject({
      status: "confirmation_required",
      products: [{ id: "a" }],
    });
    for (const lines of [
      ["Example Original"],
      ["Example", "400 g"],
      ["Example Original", "per 100 g"],
      ["Example Original", "4OO g"],
    ])
      expect(runtime().suggest(lines, [], ["a"]).status).toBe("unknown");
    expect(runtime().suggest(["Example Original", "400 g"], [], ["b"]).status).toBe("unknown");
  });
  it("ROI never hides size/variant contradictions or supplies a missing full-image name", () => {
    expect(runtime().suggest(["Example Original", "400 g"], ["750 g"], ["a", "b"]).status).toBe(
      "unknown",
    );
    expect(runtime().suggest(["Example Original Zero", "400 g"], [], ["a"]).status).toBe("unknown");
    expect(runtime().suggest([], ["Example Original", "400 g"], ["a"]).status).toBe("unknown");
  });
});
