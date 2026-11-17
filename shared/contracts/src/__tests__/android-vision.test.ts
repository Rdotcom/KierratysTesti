import { describe, expect, it } from "vitest";
import { normalizeAndroidVisionEvidence } from "../android-vision";
const raw = {
  schemaVersion: "android-local-evidence-v1",
  engine: "mlkit-bundled-latin-v1",
  observedAt: "2026-11-17T00:00:00Z",
  width: 720,
  height: 1280,
  codes: ["6408430030309"],
  markings: ["PAP 21"],
};
describe("bounded Android observation boundary", () => {
  it("returns unverified material-code candidates and valid GTIN, never a material/bin", () => {
    expect(normalizeAndroidVisionEvidence(JSON.stringify(raw))).toMatchObject({
      codes: ["6408430030309"],
      markings: { status: "candidates", candidates: [{ canonicalCode: "PAP 21" }] },
      source: { verification: "unverified", scope: "codes_only" },
    });
    expect(normalizeAndroidVisionEvidence(JSON.stringify(raw))).not.toHaveProperty("destination");
  });
  it("retains ambiguity and rejects invalid checksum codes", () => {
    const r = normalizeAndroidVisionEvidence(
      JSON.stringify({ ...raw, codes: ["12345678"], markings: ["21 PAP", "05 PP"] }),
    );
    expect(r.codes).toEqual([]);
    expect(r.markings.status).toBe("ambiguous");
  });
  it.each([
    null,
    "{",
    "x".repeat(8193),
    JSON.stringify({ ...raw, engine: "apple-vision" }),
    JSON.stringify({ ...raw, width: 4096, height: 4096 }),
    JSON.stringify({ ...raw, markings: ["PAP\u202e"] }),
    JSON.stringify({ ...raw, material: "metal" }),
  ])("rejects invalid or fabricated native payload %#", (v) =>
    expect(() => normalizeAndroidVisionEvidence(v)).toThrow(),
  );
});
