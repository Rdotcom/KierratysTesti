import { describe, expect, it } from "vitest";
import { createReferenceEmbeddingIndex } from "../reference-image-embedding";

// Generated basis vectors, not encoded product images or accuracy evidence.
const basis = (x = 1, y = 0) => [x, y, ...Array<number>(510).fill(0)];
const identity = {
  encoderSha256: "a".repeat(64),
  preprocessingSha256: "b".repeat(64),
  catalogueSha256: "c".repeat(64),
};
const reference = (productId: string, digit: string, vector = basis()) => ({
  productId,
  referenceId: `${productId}-${digit}`,
  imageSha256: digit.repeat(64),
  vector,
});
const gallery = () => ({
  ...identity,
  minimumCosine: 0.9,
  minimumMargin: 0.08,
  references: [reference("first", "1"), reference("second", "2", basis(0, 1))],
});
const query = () => ({ ...identity, imageSha256: "f".repeat(64), vector: basis() });
function row(value: ReturnType<typeof gallery>, index: number) {
  const found = value.references[index];
  if (!found) throw new Error("synthetic_reference_required");
  return found;
}
function ready(value = gallery()) {
  const result = createReferenceEmbeddingIndex(JSON.stringify(value));
  if (result.status !== "ready") throw new Error("synthetic_index_required");
  return result;
}
describe("experimental original embedding retrieval", () => {
  it("ranks actual coordinates and retains asserted provenance without a verified/bin claim", () => {
    expect(ready().compare(JSON.stringify(query()))).toEqual({
      algorithmVersion: "reference-cosine-retrieval-v1",
      integrationAllowed: false,
      verificationStatus: "inferred",
      confidence: "uncalibrated_visual_similarity",
      status: "candidate",
      productId: "first",
      referenceId: "first-1",
      referenceImageSha256: "1".repeat(64),
      queryImageSha256: "f".repeat(64),
      ...identity,
      cosine: 1,
      competitorCosine: 0,
    });
  });
  it("does not use filenames/product IDs as features", () => {
    const value = query();
    value.vector = basis(0, 1);
    expect(ready().compare(JSON.stringify(value))).toMatchObject({
      status: "candidate",
      productId: "second",
    });
  });
  it.each([Number.MAX_VALUE, Number.MIN_VALUE, 1e-200, 1e200])(
    "normalizes finite scale %s without overflow or underflow",
    (scale) => {
      const value = gallery();
      row(value, 0).vector = basis(scale);
      const q = query();
      q.vector = basis(scale);
      expect(ready(value).compare(JSON.stringify(q))).toMatchObject({
        status: "candidate",
        cosine: 1,
      });
    },
  );
  it("separates weak similarity from malformed input", () => {
    const q = query();
    q.vector = basis(-1, -1);
    expect(ready().compare(JSON.stringify(q))).toMatchObject({
      status: "unknown",
      reason: "below_similarity_gate",
    });
  });
  it("abstains on two identical but differently identified embeddings", () => {
    const value = gallery();
    row(value, 1).vector = basis();
    expect(ready(value).compare(JSON.stringify(query()))).toMatchObject({
      status: "ambiguous",
      productIds: ["first", "second"],
    });
  });
  it("does not discard a margin-destroying competitor below the absolute gate", () => {
    const value = gallery();
    value.minimumCosine = 0.95;
    value.minimumMargin = 0.12;
    row(value, 1).vector = basis(0.89, Math.sqrt(1 - 0.89 ** 2));
    expect(ready(value).compare(JSON.stringify(query()))).toMatchObject({ status: "ambiguous" });
  });
  it("uses per-product competitors so multiple views do not create false ambiguity", () => {
    const value = gallery();
    value.references.push(reference("first", "3"));
    expect(ready(value).compare(JSON.stringify(query()))).toMatchObject({
      status: "candidate",
      referenceId: "first-1",
      competitorCosine: 0,
    });
  });
  it("is independent of reference order and earlier returned result mutations", () => {
    const value = gallery();
    row(value, 1).vector = basis();
    const index = ready(value),
      a = index.compare(JSON.stringify(query()));
    if (a.status !== "ambiguous") throw new Error("expected_tie");
    (a.productIds as string[]).pop();
    value.references.reverse();
    expect(index.compare(JSON.stringify(query()))).toEqual(
      ready(value).compare(JSON.stringify(query())),
    );
  });
  it("allows a single-product gallery without inventing a competitor score", () => {
    const value = gallery();
    value.references.pop();
    expect(ready(value).compare(JSON.stringify(query()))).toMatchObject({
      status: "candidate",
      competitorCosine: null,
    });
  });
  it.each(["encoderSha256", "preprocessingSha256", "catalogueSha256"] as const)(
    "rejects drift in %s",
    (field) => {
      const value = query();
      value[field] = "e".repeat(64);
      expect(ready().compare(JSON.stringify(value))).toMatchObject({
        status: "invalid",
        reason: "identity_mismatch",
      });
    },
  );
  it("refuses a query whose encoded-byte hash occurs anywhere in enrollment", () => {
    const value = query();
    value.imageSha256 = "2".repeat(64);
    expect(ready().compare(JSON.stringify(value))).toMatchObject({
      status: "invalid",
      reason: "enrollment_image",
    });
  });
  it.each(
    [
      [],
      Array<number>(511).fill(1),
      Array<number>(513).fill(1),
      Array<number>(512).fill(0),
      ["bad"],
    ].map((vector) => ({ vector })),
  )("rejects invalid query coordinates %#", ({ vector }) => {
    expect(ready().compare(JSON.stringify({ ...query(), vector }))).toMatchObject({
      status: "invalid",
      reason: "invalid_query",
    });
  });
  it("rejects malformed, excessive and extra-field query envelopes without getter access", () => {
    const hostile = {
      get vector() {
        throw new Error("must_not_read");
      },
    };
    for (const input of [
      hostile,
      null,
      "{",
      "x".repeat(32769),
      JSON.stringify({ ...query(), verified: true }),
      JSON.stringify({ ...query(), vector: Array(512).fill(null) }),
    ])
      expect(ready().compare(input)).toMatchObject({ status: "invalid", reason: "invalid_query" });
  });
  it("rejects duplicate reference IDs or image bytes even under different products", () => {
    const value = gallery();
    value.references.push({ ...row(value, 0) });
    expect(createReferenceEmbeddingIndex(JSON.stringify(value))).toEqual({ status: "invalid" });
    row(value, 2).referenceId = "unique";
    row(value, 2).productId = "third";
    expect(createReferenceEmbeddingIndex(JSON.stringify(value))).toEqual({ status: "invalid" });
  });
  it("bounds gallery size, IDs, gates and zero vectors", () => {
    for (const edit of [
      (v: ReturnType<typeof gallery>) => {
        v.references = [];
      },
      (v: ReturnType<typeof gallery>) => {
        v.references = Array(33).fill(v.references[0]);
      },
      (v: ReturnType<typeof gallery>) => {
        v.minimumMargin = 0;
      },
      (v: ReturnType<typeof gallery>) => {
        v.minimumCosine = 1.1;
      },
      (v: ReturnType<typeof gallery>) => {
        row(v, 0).productId = "../../outside";
      },
      (v: ReturnType<typeof gallery>) => {
        row(v, 0).vector = Array(512).fill(0);
      },
    ]) {
      const value = gallery();
      edit(value);
      expect(createReferenceEmbeddingIndex(JSON.stringify(value))).toEqual({ status: "invalid" });
    }
  });
  it("rejects unbounded/unserialized galleries before reading any caller object", () => {
    for (const value of [
      null,
      "{",
      "x".repeat(524289),
      {
        get references() {
          throw new Error("must_not_read");
        },
      },
    ])
      expect(createReferenceEmbeddingIndex(value)).toEqual({ status: "invalid" });
  });
});
