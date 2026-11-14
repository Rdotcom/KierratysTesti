import { describe, expect, it } from "vitest";
import { createMaxMarginReferenceIndex } from "../reference-image-max-margin";

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
    {
      productId: "a",
      referenceId: "two",
      imageSha256: "2".repeat(64),
      vector: vector(0.95, Math.sqrt(1 - 0.95 ** 2)),
    },
  ],
  negatives: [{ imageSha256: "3".repeat(64), vector: vector(-1) }],
});
const query = (v = vector()) =>
  JSON.stringify({ ...identity, imageSha256: "f".repeat(64), vector: v });
function ready(value = fixture()) {
  const index = createMaxMarginReferenceIndex(JSON.stringify(value));
  if (index.status !== "ready") throw Error("fixture_required");
  return index;
}
describe("original max-margin and two-reference support", () => {
  it("uses a midpoint instead of a near-identical-gallery-only gate", () => {
    expect(ready().calibration[0]?.minimumCosine).toBe(0.75);
    expect(ready().compare(query())).toMatchObject({
      status: "candidate",
      supportingReferences: 2,
      integrationAllowed: false,
    });
  });
  it("requires both reference supports, not just a single attractive crop", () => {
    const value = fixture();
    value.references[1] = {
      productId: "a",
      referenceId: "two",
      imageSha256: "2".repeat(64),
      vector: vector(0.6, 0.8),
    };
    expect(ready(value).compare(query())).toMatchObject({
      status: "unknown",
      reason: "insufficient_reference_support",
    });
  });
  it("preserves calibration-image exclusion and model identity validation", () => {
    expect(
      ready().compare(
        JSON.stringify({ ...identity, imageSha256: "3".repeat(64), vector: vector() }),
      ),
    ).toMatchObject({ status: "invalid", reason: "training_image" });
    expect(
      ready().compare(
        JSON.stringify({
          ...identity,
          encoderSha256: "d".repeat(64),
          imageSha256: "f".repeat(64),
          vector: vector(),
        }),
      ).status,
    ).toBe("invalid");
  });
  it("does not rescue inseparable galleries", () => {
    const value = fixture();
    value.negatives[0] = { imageSha256: "3".repeat(64), vector: vector() };
    expect(ready(value).compare(query()).status).toBe("unknown");
  });
  it("retains competing identity ambiguity before support could choose a winner", () => {
    const value = fixture();
    for (const digit of ["4", "5"])
      value.references.push({
        productId: "b",
        referenceId: `b-${digit}`,
        imageSha256: digit.repeat(64),
        vector: vector(),
      });
    expect(ready(value).compare(query())).toMatchObject({
      status: "ambiguous",
      productIds: ["a", "b"],
    });
  });
  it("bounds untrusted gallery and query envelopes through strict validators", () => {
    for (const input of [
      null,
      "{",
      "x".repeat(2097153),
      {
        get references() {
          throw Error("must_not_read");
        },
      },
    ])
      expect(createMaxMarginReferenceIndex(input).status).toBe("invalid");
    for (const q of [null, "{", "x".repeat(32769)])
      expect(ready().compare(q).status).toBe("invalid");
  });
});
