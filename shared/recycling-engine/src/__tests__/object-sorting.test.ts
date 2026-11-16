import { describe, expect, it } from "vitest";
import {
  evaluateObjectSorting,
  sortableObjectKinds,
  type SortableObjectKind,
} from "../object-sorting";
const now = "2026-11-16T18:00:00.000Z";
const run = (kind: SortableObjectKind, ...answers: string[]) =>
  evaluateObjectSorting({ kind, answers, evaluatedAt: now });
describe("explicit object selection policy", () => {
  it.each(["spoon", "fork", "knife"] as const)(
    "asks material before routing %s to small metal",
    (kind) => {
      expect(run(kind).status).toBe("question");
      const result = run(kind, "metal");
      expect(result.status).toBe("guidance");
      if (result.status !== "guidance") throw Error("result");
      expect(result.destination.fi).toBe("Metallinkeräys");
      expect(result.preparation.fi).toContain("aukkoon");
      expect(result.sources[0]?.jurisdiction).toBe("FI");
      expect(result.confidence).toBe("user_confirmed");
    },
  );
  it.each(["ceramic", "glass"])("does not treat a %s mug as glass packaging", (material) => {
    expect(run("cup", material)).toMatchObject({ status: "question", id: "region" });
    const result = run("cup", material, "hsy");
    expect(result).toMatchObject({ status: "guidance", sources: [{ jurisdiction: "FI-HSY" }] });
    if (result.status !== "guidance") throw Error("result");
    expect(result.destination.fi).toContain("Sekajäte");
    expect(result.preparation.fi).toContain("Ei lasipakkausten");
    expect(run("cup", material, "elsewhere").status).toBe("unknown");
  });
  it("distinguishes packaging from a reusable plastic object", () => {
    expect(run("bottle", "plastic")).toMatchObject({ status: "question", id: "use" });
    expect(run("bottle", "plastic", "item")).toMatchObject({ status: "question", id: "region" });
    const result = run("bottle", "plastic", "item", "hsy");
    expect(result.status).toBe("guidance");
    if (result.status === "guidance") expect(result.preparation.fi).toContain("Ei muovipakkausten");
  });
  it.each([
    ["bottle", "plastic", "Muovipakkausten"],
    ["jar", "glass", "Lasipakkausten"],
    ["can", "metal", "Metallinkeräys"],
    ["carton", "carton", "Kartonkipakkausten"],
    ["bag", "carton", "Kartonkipakkausten"],
    ["cup", "carton", "Kartonkipakkausten"],
  ] as const)("reuses packaging policy only after %s/%s confirmation", (kind, material, label) => {
    const result = run(kind, material, "packaging");
    expect(result.status).toBe("guidance");
    if (result.status !== "guidance") throw Error("result");
    expect(result.destination.fi).toContain(label);
    expect(result.sources[0]?.version).toBe("fi-rinki-2026-08-10.1");
    expect(result.verification).toBe("user_confirmed");
  });
  it.each(["bottle", "can"] as const)(
    "requires explicit Finnish deposit selection for %s",
    (kind) => {
      const result = run(kind, "metal", "deposit");
      expect(result.status).toBe("guidance");
      if (result.status === "guidance")
        expect(result.destination.fi).toBe("Kaupan palautusautomaatti");
    },
  );
  it("never puts a glass cup into packaging collection by forging an answer", () => {
    expect(run("cup", "glass", "packaging").status).toBe("unknown");
    expect(run("carton", "glass", "packaging").status).toBe("unknown");
    expect(run("jar", "glass", "deposit").status).toBe("unknown");
  });
  it("abstains for unknown materials and unsafe/unconfirmed packaging", () => {
    expect(run("spoon", "unknown").status).toBe("unknown");
    expect(run("spoon", "wood").status).toBe("unknown");
    const unsafe = run("bottle", "plastic", "unsafe");
    expect(unsafe.status).toBe("unknown");
    if (unsafe.status !== "unknown") throw Error("unsafe_result");
    expect(unsafe).not.toHaveProperty("destination");
    expect(unsafe.sources.length).toBeGreaterThan(0);
  });
  it("a phone goes to WEEE without guessing its casing material", () => {
    expect(run("phone")).toMatchObject({
      status: "guidance",
      sources: [{ id: "fi.object.phone" }],
    });
  });
  it("checks battery type and preserves large/damaged battery recovery", () => {
    expect(run("battery")).toMatchObject({ status: "question", id: "battery-type" });
    const result = run("battery", "small");
    expect(result.status).toBe("guidance");
    if (result.status === "guidance") expect(result.preparation.fi).toContain("Teippaa");
    expect(run("battery", "other").status).toBe("unknown");
  });
  it("regional textile rules require region and condition, including exclusions", () => {
    expect(run("textile")).toMatchObject({ status: "question", id: "region" });
    expect(run("textile", "hsy")).toMatchObject({ status: "question", id: "textile-condition" });
    expect(run("textile", "elsewhere").status).toBe("unknown");
    expect(run("textile", "hsy", "other").status).toBe("unknown");
    const result = run("textile", "hsy", "worn");
    if (result.status !== "guidance") throw Error("result");
    expect(result.preparation.fi).toContain("Ei alusvaatteita");
    expect(run("textile", "hsy", "reusable")).toMatchObject({
      status: "guidance",
      destination: { fi: "Uudelleenkäyttö" },
    });
  });
  it.each([
    null,
    {},
    { kind: "other", answers: [], evaluatedAt: now },
    { kind: "spoon", answers: ["metal", "hsy"], evaluatedAt: now },
    { kind: "phone", answers: [], evaluatedAt: "invalid" },
    { kind: "phone", answers: [], evaluatedAt: "2026-11-15T00:00:00Z" },
    { kind: "phone", answers: [], evaluatedAt: now, modelScore: 1 },
    { kind: "spoon", answers: Array(7).fill("metal"), evaluatedAt: now },
  ])("rejects invalid, extra, obsolete or model-derived input %#", (input) => {
    expect(evaluateObjectSorting(input).status).toBe("unknown");
  });
  it("every reachable branch is bounded, bilingual, sourced and independent of model scores", () => {
    let terminals = 0;
    function walk(kind: SortableObjectKind, answers: string[]) {
      expect(answers.length).toBeLessThanOrEqual(4);
      const result = run(kind, ...answers);
      if (result.status === "question") {
        expect(result.title.fi).not.toBe("");
        expect(result.title.en).not.toBe("");
        expect(new Set(result.choices.map((c) => c.id)).size).toBe(result.choices.length);
        for (const option of result.choices) {
          expect(option.label.fi).not.toBe("");
          expect(option.label.en).not.toBe("");
          expect(option).not.toHaveProperty("next");
          walk(kind, [...answers, option.id]);
        }
      } else {
        terminals++;
        expect(result.explanation.fi).not.toBe("");
        expect(result.explanation.en).not.toBe("");
        if (result.status === "guidance") {
          expect(result.sources.length).toBeGreaterThan(0);
          for (const reference of result.sources) {
            expect(reference.sourceUrl).toMatch(/^https:\/\//);
            expect(reference.checkedAt).toMatch(/^2026-/);
            expect(reference.verificationStatus).toBe("verified");
            expect(reference.version).not.toBe("");
            expect(["FI", "FI-HSY"]).toContain(reference.jurisdiction);
          }
        }
      }
    }
    for (const kind of sortableObjectKinds) walk(kind, []);
    expect(terminals).toBeGreaterThan(50);
  });
});
