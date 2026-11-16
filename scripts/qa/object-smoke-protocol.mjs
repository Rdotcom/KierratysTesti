import assert from "node:assert/strict";
export const objectSmoke = Object.freeze({
  version: "web-object-smoke-v1",
  maximumImagesPerModel: 4,
  maximumImageAttempts: 8,
  automaticAcceptance: false,
  retries: 0,
  classes: Object.freeze([
    "cup",
    "spoon",
    "fork",
    "knife",
    "bottle",
    "jar",
    "can",
    "carton",
    "bag",
    "battery",
    "phone",
    "textile",
    "multiple-cups",
    "spoon-and-fork",
    "other",
  ]),
  prompts: Object.freeze([
    "a photo of a single cup",
    "a photo of a single spoon",
    "a photo of a single fork",
    "a photo of a single knife",
    "a photo of a bottle",
    "a photo of a jar",
    "a photo of a drink can",
    "a photo of a cardboard carton",
    "a photo of a bag",
    "a photo of a battery",
    "a photo of a mobile phone",
    "a photo of clothing",
    "a photo of multiple cups",
    "a photo of a spoon and a fork together",
    "a photo of another object",
  ]),
  rows: Object.freeze([
    Object.freeze({
      id: "commons-1-clean",
      role: "multi-object-control",
      expected: "multiple-cups",
    }),
    Object.freeze({ id: "commons-2-clean", role: "text-free-positive", expected: "spoon" }),
    Object.freeze({ id: "commons-3-clean", role: "text-free-positive", expected: "spoon" }),
    Object.freeze({
      id: "commons-4-clean",
      role: "multi-object-control",
      expected: "spoon-and-fork",
    }),
  ]),
  excluded: Object.freeze([
    {
      id: "commons-5-clean",
      reason: "unresolved uploader/photographer credit discrepancy; no inference",
    },
  ]),
});
export function summarizeObjectSmoke(observations) {
  assert(Array.isArray(observations) && observations.length === 8, "all_rows_required");
  const summary = {};
  for (const model of ["mobileclip", "siglip2"]) {
    const rows = observations.filter((r) => r.model === model);
    assert(
      rows.length === 4 && new Set(rows.map((r) => r.id)).size === 4,
      "duplicate_or_missing_model_row",
    );
    for (const r of rows) {
      assert(
        objectSmoke.rows.some((p) => p.id === r.id),
        "unregistered_image",
      );
      if (!r.failure) {
        assert(
          Array.isArray(r.scores) && r.scores.length === objectSmoke.classes.length,
          "missing_scores",
        );
        assert(
          new Set(r.scores.map((s) => s.group)).size === objectSmoke.classes.length,
          "duplicate_score",
        );
        assert(
          r.scores.every(
            (s) =>
              objectSmoke.classes.includes(s.group) &&
              Number.isFinite(s.cosine) &&
              Math.abs(s.cosine) <= 1.00001,
          ),
          "invalid_score",
        );
      }
    }
    const rank = (r) =>
      r.failure
        ? []
        : [...r.scores].sort((a, b) => b.cosine - a.cosine || a.group.localeCompare(b.group));
    summary[model] = {
      rows: rows.map((r) => ({
        id: r.id,
        role: objectSmoke.rows.find((p) => p.id === r.id).role,
        expected: objectSmoke.rows.find((p) => p.id === r.id).expected,
        top3: rank(r).slice(0, 3),
        failure: r.failure ?? null,
      })),
      positives: 2,
      controls: 2,
      failures: rows.filter((r) => r.failure).length,
      positiveTop1: rows.filter(
        (r) =>
          objectSmoke.rows.find((p) => p.id === r.id).role === "text-free-positive" &&
          rank(r)[0]?.group === "spoon",
      ).length,
      controlTop1: rows.filter((r) => {
        const p = objectSmoke.rows.find((p) => p.id === r.id);
        return p.role === "multi-object-control" && rank(r)[0]?.group === p.expected;
      }).length,
      automaticAccepts: 0,
      releaseReady: false,
    };
  }
  return summary;
}
