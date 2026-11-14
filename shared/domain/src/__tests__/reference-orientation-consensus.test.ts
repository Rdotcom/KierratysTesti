import { describe, expect, it } from "vitest";
import { fuseReferenceOrientations } from "../reference-orientation-consensus";
const h = (n: number) => n.toString(16).padStart(64, "0");
const fixture = () => ({
  originalImageSha256: h(0),
  catalogueSha256: h(10),
  encoderSha256: h(11),
  preprocessingSha256: h(12),
  enrolledProductIds: ["a", "b"],
  views: [0, 90, 180, 270].map((rotation, i) => ({
    rotation,
    queryImageSha256: h(i),
    catalogueSha256: h(10),
    encoderSha256: h(11),
    preprocessingSha256: h(12),
    status: "unknown",
    productIds: [] as string[],
  })),
});
const run = (input = fixture()) => fuseReferenceOrientations(JSON.stringify(input));
describe("fixed rotation consensus, never a weaker per-view recognizer", () => {
  it("all unknown stays unknown with no fabricated identity/material/probability", () => {
    expect(run()).toMatchObject({
      status: "unknown",
      productIds: [],
      integrationAllowed: false,
      verificationStatus: "inferred",
    });
  });
  it("a full-runtime candidate can recover unknown original orientation", () => {
    const f = fixture();
    Object.assign(f.views[1]!, { status: "candidate", productIds: ["a"] });
    expect(run(f)).toMatchObject({
      status: "candidate",
      productIds: ["a"],
      supportingRotations: [90],
    });
  });
  it("any ambiguity or positive disagreement vetoes even three agreeing views", () => {
    for (const status of ["candidate", "ambiguous"]) {
      const f = fixture();
      for (const v of f.views) Object.assign(v, { status: "candidate", productIds: ["a"] });
      Object.assign(f.views[3]!, {
        status,
        productIds: status === "ambiguous" ? ["a", "b"] : ["b"],
      });
      expect(run(f).status).toBe("ambiguous");
    }
  });
  it("failures never masquerade as unknown and cannot recover a candidate", () => {
    for (const status of ["invalid", "unavailable"]) {
      const f = fixture();
      Object.assign(f.views[0]!, { status: "candidate", productIds: ["a"] });
      f.views[1]!.status = status;
      expect(run(f).status).toBe("unavailable");
    }
  });
  it("requires four distinct fixed views and original-byte anchor", () => {
    for (const edit of [
      (f: ReturnType<typeof fixture>) => f.views.pop(),
      (f: ReturnType<typeof fixture>) => {
        f.views[1]!.rotation = 0;
      },
      (f: ReturnType<typeof fixture>) => {
        f.views[1]!.queryImageSha256 = h(0);
      },
      (f: ReturnType<typeof fixture>) => {
        f.originalImageSha256 = h(4);
      },
    ]) {
      const f = fixture();
      edit(f);
      expect(run(f).status).toBe("invalid");
    }
  });
  it("rejects encoder/preprocess/catalogue mismatch, unenrolled IDs and impossible statuses", () => {
    for (const patch of [
      { encoderSha256: h(20) },
      { preprocessingSha256: h(20) },
      { catalogueSha256: h(20) },
      { status: "candidate", productIds: ["outside"] },
      { status: "candidate", productIds: [] },
      { status: "ambiguous", productIds: ["a"] },
      { status: "unknown", productIds: ["a"] },
      { status: "candidate", productIds: ["a", "a"] },
    ]) {
      const f = fixture();
      Object.assign(f.views[0]!, patch);
      expect(run(f).status).toBe("invalid");
    }
  });
  it("bounded serialized plain data only; never reads caller accessors or accepts verified flags", () => {
    for (const input of [
      null,
      "{",
      "x".repeat(32769),
      {
        get views() {
          throw Error("must_not_read");
        },
      },
      JSON.stringify({ ...fixture(), verified: true }),
    ])
      expect(fuseReferenceOrientations(input).status).toBe("invalid");
  });
});
