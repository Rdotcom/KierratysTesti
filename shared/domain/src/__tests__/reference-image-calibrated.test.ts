import { describe, expect, it } from "vitest";
import { createCalibratedReferenceIndex } from "../reference-image-calibrated";

const vector = (a = 1, b = 0) => [a, b, ...Array<number>(510).fill(0)];
const identity = {
  encoderSha256: "a".repeat(64),
  preprocessingSha256: "b".repeat(64),
  catalogueSha256: "c".repeat(64),
};
const fixture = () => ({
  ...identity,
  references: [
    { productId: "a", referenceId: "one", imageSha256: "1".repeat(64), vector: vector() },
    { productId: "a", referenceId: "two", imageSha256: "2".repeat(64), vector: vector(0.8, 0.6) },
  ],
  negatives: [{ imageSha256: "3".repeat(64), vector: vector(-1) }],
});
function ready(value = fixture()) {
  const index = createCalibratedReferenceIndex(JSON.stringify(value));
  if (index.status !== "ready") throw Error("synthetic_index_required");
  return index;
}
const query = (values = vector()) =>
  JSON.stringify({ ...identity, imageSha256: "f".repeat(64), vector: values });
describe("original gallery and negative-only calibration", () => {
  it("learns from reference pairs without query data and retains inferred status", () => {
    const index = ready();
    expect(index.calibration[0]).toMatchObject({
      galleryMinimum: 0.8,
      minimumCosine: 0.78,
      enabled: true,
    });
    expect(index.compare(query())).toMatchObject({
      status: "candidate",
      productId: "a",
      minimumCosine: 0.78,
      integrationAllowed: false,
      confidence: "uncalibrated_visual_similarity",
    });
  });
  it("retains the absolute floor when galleries have broad variation", () => {
    const input = fixture();
    input.references[1] = {
      ...input.references[1],
      productId: "a",
      referenceId: "two",
      imageSha256: "2".repeat(64),
      vector: vector(0.7, Math.sqrt(0.51)),
    };
    expect(ready(input).calibration[0]?.minimumCosine).toBe(0.75);
  });
  it("uses calibration negatives rather than weakening a threshold to fit positives", () => {
    const input = fixture();
    input.negatives[0] = { imageSha256: "3".repeat(64), vector: vector(0, 1) };
    const gate = ready(input).calibration[0];
    expect(gate?.maximumNegative).toBeCloseTo(0.6, 12);
    expect(gate?.minimumCosine).toBe(0.78);
  });
  it("disables inseparable products and never emits a candidate", () => {
    const input = fixture();
    input.negatives[0] = { imageSha256: "3".repeat(64), vector: vector() };
    const index = ready(input);
    expect(index.calibration[0]?.enabled).toBe(false);
    expect(index.compare(query())).toMatchObject({
      status: "unknown",
      reason: "inseparable_gallery",
    });
  });
  it("raises the threshold when training negatives approach a tight gallery", () => {
    const input = fixture();
    input.references[1] = {
      productId: "a",
      referenceId: "two",
      imageSha256: "2".repeat(64),
      vector: vector(),
    };
    input.negatives[0] = {
      imageSha256: "3".repeat(64),
      vector: vector(0.94, Math.sqrt(1 - 0.94 ** 2)),
    };
    const gate = ready(input).calibration[0];
    expect(gate?.minimumCosine).toBeCloseTo(0.99, 12);
    expect(gate?.enabled).toBe(true);
  });
  it("lets a competitor below its own threshold still veto a close winner", () => {
    const input = fixture();
    input.references[1] = {
      productId: "a",
      referenceId: "two",
      imageSha256: "2".repeat(64),
      vector: vector(),
    };
    for (const digit of ["4", "5"])
      input.references.push({
        productId: "b",
        referenceId: `b-${digit}`,
        imageSha256: digit.repeat(64),
        vector: vector(0.95, Math.sqrt(1 - 0.95 ** 2)),
      });
    expect(ready(input).compare(query())).toMatchObject({
      status: "ambiguous",
      productIds: ["a", "b"],
    });
  });
  it("rejects query copies of enrollment or calibration images", () => {
    for (const digit of ["1", "2", "3"])
      expect(
        ready().compare(
          JSON.stringify({ ...identity, imageSha256: digit.repeat(64), vector: vector() }),
        ),
      ).toMatchObject({ status: "invalid", reason: "training_image" });
  });
  it("rejects absent negatives, singleton identities and duplicate image memberships", () => {
    const first = fixture();
    first.negatives = [];
    expect(createCalibratedReferenceIndex(JSON.stringify(first)).status).toBe("invalid");
    const second = fixture();
    second.references.pop();
    expect(createCalibratedReferenceIndex(JSON.stringify(second)).status).toBe("invalid");
    const third = fixture();
    third.negatives[0] = { imageSha256: "1".repeat(64), vector: vector() };
    expect(createCalibratedReferenceIndex(JSON.stringify(third)).status).toBe("invalid");
  });
  it("does not admit expected labels, caller gates, verified fields or getters", () => {
    for (const input of [
      { ...fixture(), expected: "a" },
      { ...fixture(), floor: 0 },
      {
        get references() {
          throw Error("must_not_read");
        },
      },
      null,
      "x".repeat(2097153),
    ])
      expect(
        createCalibratedReferenceIndex(
          typeof input === "string"
            ? input
            : input === null || Object.getOwnPropertyDescriptor(input, "references")?.get
              ? input
              : JSON.stringify(input),
        ).status,
      ).toBe("invalid");
  });
  it("rejects wrong model, malformed/zero/nonfinite or oversized query vectors", () => {
    for (const input of [
      JSON.stringify({
        ...identity,
        encoderSha256: "d".repeat(64),
        imageSha256: "f".repeat(64),
        vector: vector(),
      }),
      query(Array(512).fill(0)),
      query([1]),
      "x".repeat(32769),
      "{",
    ])
      expect(ready().compare(input).status).toBe("invalid");
  });
  it("bounds reference and negative vectors, rejecting zeros and nonfinite values", () => {
    const input = fixture();
    input.references[0] = {
      productId: "a",
      referenceId: "one",
      imageSha256: "1".repeat(64),
      vector: Array(512).fill(0),
    };
    expect(createCalibratedReferenceIndex(JSON.stringify(input)).status).toBe("invalid");
    const second = fixture();
    second.negatives[0] = {
      imageSha256: "3".repeat(64),
      vector: [Number.NaN, ...Array(511).fill(0)],
    };
    expect(createCalibratedReferenceIndex(JSON.stringify(second)).status).toBe("invalid");
  });
  it("keeps calibration immutable and isolated from result mutation", () => {
    const index = ready();
    expect(Object.isFrozen(index.calibration)).toBe(true);
    expect(Object.isFrozen(index.calibration[0])).toBe(true);
    expect(index.compare(query())).toEqual(index.compare(query()));
  });
});
