import { describe, expect, it } from "vitest";
import {
  importReferenceCatalogue,
  REFERENCE_CATALOGUE_VERSION,
} from "../reference-image-catalogue";

// Entirely synthetic metadata. These labels/hashes/zero GTINs are not a real
// product catalogue, real reviewer acceptance or image/identity ground truth.
const policy = { asOf: "2026-11-10", featureVersion: "pixel-scale-corners-v2" };
const sha = (number: number) => number.toString(16).padStart(64, "0");
const review = () => ({
  status: "accepted",
  reviewerId: "synthetic-reviewer",
  reviewedOn: "2026-11-09",
  evidence: "Synthetic fixture acceptance only",
  reconciliation: "accepted",
});
function fixture() {
  const references = ["enroll-a", "enroll-b", "query-a"].map((id, index) => ({
    referenceId: id,
    productId: "synthetic-product",
    imageSha256: sha(index + 1),
    capturedOn: "2026-11-08",
    sourceFamilyId: `family-${index}`,
    captureGroupId: `capture-${index}`,
    split: index < 2 ? "enrollment" : "independent_query",
    origin: "independent_capture",
    rights: {
      kind: "owner_capture",
      ownerAlias: "synthetic-owner",
      license: "OWNER-PERMISSION",
      permissionEvidenceId: `permission-${index}`,
      review: review(),
    },
  }));
  return {
    schemaVersion: REFERENCE_CATALOGUE_VERSION,
    catalogueId: "synthetic-catalogue",
    featureVersion: policy.featureVersion,
    products: [
      {
        productId: "synthetic-product",
        label: "Synthetic fixture product",
        gtin: "00000000000000",
        identity: {
          method: "physical_label",
          evidenceId: "synthetic-label-review",
          review: review(),
        },
      },
    ],
    references,
    featureReceipts: references.map((item, index) => ({
      referenceId: item.referenceId,
      imageSha256: item.imageSha256,
      featureSha256: sha(index + 100),
      featureVersion: policy.featureVersion,
    })),
    acceptance: review(),
  };
}
function importFixture(edit: (value: ReturnType<typeof fixture>) => void) {
  const value = fixture();
  edit(value);
  return importReferenceCatalogue(value, policy);
}
function invalidInput(value: unknown) {
  expect(importReferenceCatalogue(value, policy).status).toBe("invalid");
}
function item<T>(values: readonly T[], index = 0): T {
  const value = values[index];
  if (value === undefined) throw new Error("missing_synthetic_fixture");
  return value;
}

describe("strict reference catalogue intake", () => {
  it("accepts complete asserted metadata but never calls it verified identity or integration-ready", () => {
    const result = importReferenceCatalogue(fixture(), policy);
    expect(result.status).toBe("ready");
    expect(result).toMatchObject({
      readiness: "metadata_only",
      verificationStatus: "reviewer_asserted",
      bindingEvidence: "caller_asserted_sha256",
      integrationAllowed: false,
    });
    expect(result).not.toHaveProperty("accuracy");
    expect(result).not.toHaveProperty("bin");
    expect(result).not.toHaveProperty("verifiedGtin");
  });

  it("copies and freezes metadata without mutating or retaining the caller object", () => {
    const source = fixture();
    const before = JSON.stringify(source);
    const result = importReferenceCatalogue(source, policy);
    expect(JSON.stringify(source)).toBe(before);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.catalogue).not.toBe(source);
    expect(Object.isFrozen(result.catalogue)).toBe(true);
    expect(Object.isFrozen(result.catalogue.references[0]?.rights)).toBe(true);
    item(source.products).label = "Changed caller fixture";
    expect(result.catalogue.products[0]?.label).toBe("Synthetic fixture product");
  });

  it("does not fabricate a default catalogue from empty arrays", () => {
    const result = importReferenceCatalogue(
      { ...fixture(), products: [], references: [], featureReceipts: [] },
      policy,
    );
    expect(result.status).toBe("incomplete");
    if (result.status === "incomplete")
      expect(result.issues).toContainEqual({ code: "empty_catalogue" });
  });

  it.each(["pending", "rejected"])("keeps identity review %s incomplete", (status) => {
    const result = importFixture((value) => {
      item(value.products).identity.review.status = status;
    });
    expect(result.status).toBe("incomplete");
    if (result.status === "incomplete")
      expect(result.issues).toContainEqual({
        code: "identity_review_incomplete",
        productId: "synthetic-product",
      });
  });

  it("does not convert unresolved reconciliation into acceptance", () => {
    const result = importFixture((value) => {
      value.acceptance.reconciliation = "unresolved";
    });
    expect(result.status).toBe("incomplete");
  });

  it("requires actual evidence text even when flags say accepted", () => {
    invalidInput({ ...fixture(), acceptance: { ...review(), evidence: "" } });
  });

  it("requires accepted rights and excludes unreviewed capture groups from readiness", () => {
    const result = importFixture((value) => {
      item(value.references).rights.review.status = "pending";
    });
    expect(result.status).toBe("incomplete");
    if (result.status === "incomplete")
      expect(result.issues.map((item) => item.code)).toEqual(
        expect.arrayContaining(["rights_review_incomplete", "insufficient_enrollment_captures"]),
      );
  });

  it("requires two enrollment capture groups, not merely two image files", () => {
    const result = importFixture((value) => {
      item(value.references, 1).captureGroupId = "capture-0";
      item(value.references, 1).sourceFamilyId = "family-0";
    });
    expect(result.status).toBe("incomplete");
  });

  it("requires an independent query capture instead of certifying training-only data", () => {
    const result = importFixture((value) => {
      item(value.references, 2).split = "enrollment";
    });
    expect(result.status).toBe("incomplete");
    if (result.status === "incomplete")
      expect(result.issues).toContainEqual({
        code: "missing_independent_query",
        productId: "synthetic-product",
      });
  });

  it("allows a correctly bound derived enrollment image but does not count it as a new capture", () => {
    const value = fixture();
    const derived = {
      ...item(value.references),
      referenceId: "derived-a",
      imageSha256: sha(99),
      origin: "derived_capture",
      parentReferenceId: "enroll-a",
    };
    const result = importReferenceCatalogue(
      {
        ...value,
        references: [value.references[0], derived, value.references[2]],
        featureReceipts: [
          value.featureReceipts[0],
          {
            referenceId: "derived-a",
            imageSha256: sha(99),
            featureSha256: sha(199),
            featureVersion: policy.featureVersion,
          },
          value.featureReceipts[2],
        ],
      },
      policy,
    );
    expect(result.status).toBe("incomplete");
    if (result.status === "incomplete")
      expect(result.issues).toContainEqual({
        code: "insufficient_enrollment_captures",
        productId: "synthetic-product",
      });
  });

  it.each(["capture", "family"])("rejects %s lineage crossing enrollment/query", (kind) => {
    const result = importFixture((value) => {
      if (kind === "capture") {
        item(value.references, 2).captureGroupId = "capture-0";
        item(value.references, 2).sourceFamilyId = "family-0";
      } else item(value.references, 2).sourceFamilyId = "family-0";
    });
    expect(result.status).toBe("invalid");
  });

  it("rejects derived independent queries and missing/changed/self parents", () => {
    for (const parentReferenceId of ["enroll-a", "missing", "query-a"]) {
      const value = fixture();
      invalidInput({
        ...value,
        references: value.references.map((item) =>
          item.referenceId === "query-a"
            ? { ...item, origin: "derived_capture", parentReferenceId }
            : item,
        ),
      });
    }
  });

  it("rejects duplicate image bytes and reference IDs", () => {
    for (const key of ["imageSha256", "referenceId"] as const) {
      expect(
        importFixture((value) => {
          item(value.references, 1)[key] = item(value.references)[key];
        }).status,
      ).toBe("invalid");
    }
  });

  it("rejects duplicate products and normalized-equivalent GTIN identities", () => {
    const value = fixture();
    invalidInput({ ...value, products: [value.products[0], value.products[0]] });
    invalidInput({
      ...value,
      products: [
        value.products[0],
        { ...value.products[0], productId: "other-synthetic", gtin: "00000000" },
      ],
    });
  });

  it.each(["characters", "checksum", "separators", "length"])("rejects %s GTIN input", (kind) => {
    const gtin = {
      characters: "ABC",
      checksum: "00000000000001",
      separators: "0000 0000",
      length: "00000",
    }[kind];
    const value = fixture();
    invalidInput({ ...value, products: [{ ...value.products[0], gtin }] });
  });

  it("allows absent GTIN without inventing one", () => {
    const value = fixture();
    const { gtin: _gtin, ...withoutGtin } = item(value.products);
    const result = importReferenceCatalogue({ ...value, products: [withoutGtin] }, policy);
    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.catalogue.products[0]).not.toHaveProperty("gtin");
  });

  it("rejects orphan products, receipts and mismatched hash/version bindings", () => {
    expect(
      importFixture((value) => {
        item(value.references).productId = "missing";
      }).status,
    ).toBe("invalid");
    expect(
      importFixture((value) => {
        item(value.featureReceipts).referenceId = "missing";
      }).status,
    ).toBe("invalid");
    expect(
      importFixture((value) => {
        item(value.featureReceipts).imageSha256 = sha(200);
      }).status,
    ).toBe("invalid");
    const value = fixture();
    invalidInput({
      ...value,
      featureReceipts: value.featureReceipts.map((item) => ({
        ...item,
        featureVersion: "pixel-corners-v1",
      })),
    });
    invalidInput({ ...value, featureReceipts: value.featureReceipts.slice(1) });
  });

  it("rejects mismatched feature-policy/schema versions", () => {
    const value = fixture();
    invalidInput({ ...value, schemaVersion: "made-up" });
    expect(
      importReferenceCatalogue(value, { ...policy, featureVersion: "pixel-corners-v1" }).status,
    ).toBe("invalid");
    expect(
      importReferenceCatalogue(value, { ...policy, featureVersion: "external-encoder" }),
    ).toMatchObject({ status: "invalid", reason: "invalid_policy" });
  });

  it.each(["2026-02-30", "2026-13-01", "not-date", "2026-11-11"])(
    "rejects invalid/future review date %s",
    (reviewedOn) => {
      expect(
        importFixture((value) => {
          value.acceptance.reviewedOn = reviewedOn;
        }).status,
      ).toBe("invalid");
    },
  );

  it("rejects captured dates later than review/asOf and inconsistent capture metadata", () => {
    expect(
      importFixture((value) => {
        item(value.references).capturedOn = "2026-11-10";
      }).status,
    ).toBe("invalid");
    expect(importReferenceCatalogue(fixture(), { ...policy, asOf: "2026-11-08" }).status).toBe(
      "invalid",
    );
    expect(
      importFixture((value) => {
        item(value.references, 1).captureGroupId = "capture-0";
      }).status,
    ).toBe("invalid");
  });

  it("rejects catalogue acceptance that predates identity or rights review", () => {
    expect(
      importFixture((value) => {
        value.acceptance.reviewedOn = "2026-11-08";
      }).status,
    ).toBe("invalid");
    expect(
      importFixture((value) => {
        item(value.products).identity.review.reviewedOn = "2026-11-10";
      }).status,
    ).toBe("invalid");
    expect(
      importFixture((value) => {
        item(value.references).rights.review.reviewedOn = "2026-11-10";
      }).status,
    ).toBe("invalid");
  });

  it("supports attribution-bearing public provenance without fetching it", () => {
    const value = fixture();
    const rights = {
      kind: "public_source",
      sourceUrl: "https://example.org/synthetic-reference",
      authorCredit: "Synthetic fixture author",
      license: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      accessedOn: "2026-11-08",
      review: review(),
    };
    const input = { ...value, references: value.references.map((item) => ({ ...item, rights })) };
    expect(importReferenceCatalogue(input, policy).status).toBe("ready");
    invalidInput({
      ...input,
      references: [
        {
          ...input.references[0],
          rights: { ...rights, licenseUrl: "https://example.org/wrong-license" },
        },
        ...input.references.slice(1),
      ],
    });
    invalidInput({
      ...input,
      references: [
        { ...input.references[0], rights: { ...rights, accessedOn: "2026-11-10" } },
        ...input.references.slice(1),
      ],
    });
  });

  it.each([
    "http://example.org/item",
    "https://name:password@example.org/item",
    "https://example.org/item?token=private",
    "https://example.org/item#fragment",
    "https://localhost/item",
    "https://127.0.0.1/item",
    "https://192.168.1.1/item",
    "https://source.local/item",
    " https://example.org/item ",
  ])("rejects unsafe/noncanonical provenance URL %s", (url) => {
    const value = fixture();
    invalidInput({
      ...value,
      products: [
        {
          ...value.products[0],
          identity: { method: "source_catalogue", sourceUrl: url, review: review() },
        },
      ],
    });
  });

  it("accepts bounded canonical product-source provenance without changing identity status", () => {
    const value = fixture();
    expect(
      importReferenceCatalogue(
        {
          ...value,
          products: [
            {
              ...value.products[0],
              identity: {
                method: "source_catalogue",
                sourceUrl: "https://example.org/synthetic-product",
                review: review(),
              },
            },
          ],
        },
        policy,
      ),
    ).toMatchObject({ status: "ready", verificationStatus: "reviewer_asserted" });
  });

  it("rejects missing reviewers, unknown fields, control/bidi text and excessive labels", () => {
    for (const label of ["", " trimmed ", "invisible\u202etext", "line\nline", "a".repeat(161)]) {
      const value = fixture();
      invalidInput({ ...value, products: [{ ...value.products[0], label }] });
    }
    invalidInput({ ...fixture(), unknownField: true });
    invalidInput({ ...fixture(), acceptance: { ...review(), reviewerId: "" } });
  });

  it("rejects oversized, sparse, symbolic and prototype-bearing containers before traversal", () => {
    invalidInput({ ...fixture(), references: new Array(33).fill(null) });
    invalidInput({ ...fixture(), featureReceipts: new Array(3) });
    invalidInput(Object.assign(Object.create({ inherited: true }), fixture()));
    invalidInput({ ...fixture(), [Symbol("hidden")]: true });
    invalidInput(JSON.parse('{"__proto__":{"polluted":true}}'));
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it("never invokes supplied getters or iterators and contains hostile proxies", () => {
    let calls = 0;
    const getter = Object.defineProperty({}, "products", {
      get: () => {
        calls++;
        throw new Error("do not call");
      },
      enumerable: true,
    });
    invalidInput(getter);
    const value = fixture();
    Object.defineProperty(value.references, Symbol.iterator, {
      value: () => {
        calls++;
        throw new Error("do not call");
      },
    });
    invalidInput(value);
    invalidInput(
      new Proxy(
        {},
        {
          ownKeys() {
            calls++;
            throw new Error("contained proxy");
          },
        },
      ),
    );
    expect(calls).toBe(1);
  });

  it("contains malformed policy without falling back to the host clock or feature engine", () => {
    for (const value of [
      null,
      {},
      { ...policy, asOf: "2026-02-30" },
      { ...policy, extra: "unexpected" },
    ]) {
      expect(importReferenceCatalogue(fixture(), value)).toMatchObject({
        status: "invalid",
        reason: "invalid_policy",
      });
    }
  });
});
