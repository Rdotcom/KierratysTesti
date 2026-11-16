import { describe, expect, it } from "vitest";
import { guideItems, searchGuideItems } from "../object-search";
import { evaluateObjectSorting } from "../object-sorting";
const now = "2026-11-16T20:00:00Z";
describe("source-backed offline item search", () => {
  it.each(["kaukosäädin", "KAUKOSAADIN", "remote control", "remote"])(
    "routes %s to WEEE without plastic inference",
    (q) => {
      const found = searchGuideItems(q);
      expect(found.exact).toBe(true);
      expect(found.items[0]?.kind).toBe("remote");
      const step = evaluateObjectSorting({
        kind: found.items[0]?.kind,
        answers: [],
        evaluatedAt: now,
      });
      expect(step.status).toBe("guidance");
      if (step.status === "guidance") expect(step.destination.fi).toContain("SER");
    },
  );
  it("keeps electronic and ordinary toothbrush concepts separate", () => {
    expect(searchGuideItems("sähköhammasharja").items[0]?.kind).toBe("electronics");
    expect(searchGuideItems("hammasharja").exact).toBe(false);
  });
  it.each([
    "not a remote control",
    "tuntematon tuote",
    "<script>",
    null,
    "x".repeat(81),
    "muki\u202E",
  ])("does not invent a confident match for %#", (q) => {
    expect(searchGuideItems(q).exact).toBe(false);
    expect(searchGuideItems(q).items).toEqual([]);
  });
  it("all indexed names map to a real bounded policy, not a bin guessed from text", () => {
    expect(new Set(guideItems.map((i) => i.id)).size).toBe(guideItems.length);
    for (const item of guideItems) {
      expect(item.label.fi).not.toBe("");
      expect(item.label.en).not.toBe("");
      const step = evaluateObjectSorting({ kind: item.kind, answers: [], evaluatedAt: now });
      expect(["question", "guidance"]).toContain(step.status);
      expect(searchGuideItems(item.label.fi).items).toContain(item);
    }
  });
  it("regional ceramic destinations differ and unknown areas do not borrow HSY rules", () => {
    const get = (region: string) =>
      evaluateObjectSorting({ kind: "cup", answers: ["ceramic"], region, evaluatedAt: now });
    expect(get("hsy")).toMatchObject({ status: "guidance", sources: [{ jurisdiction: "FI-HSY" }] });
    const lsjh = get("lsjh");
    expect(lsjh).toMatchObject({ status: "guidance", sources: [{ jurisdiction: "FI-LSJH" }] });
    if (lsjh.status === "guidance") expect(lsjh.preparation.fi).toContain("astiakeramiikan");
    const oulu = get("kiertokaari");
    if (oulu.status !== "guidance") throw Error("missing_rule");
    expect(oulu.preparation.fi).toContain("5 kg");
    expect(get("unsupported").status).toBe("unknown");
  });
});
