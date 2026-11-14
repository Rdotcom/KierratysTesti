import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  freezeNativeCorpus,
  runNativeCorpus,
} from "../qa/reference-image/evaluate-native-corpus.mjs";
import {
  NATIVE_CORPUS_COUNTS,
  summarizeNativeCorpus,
  validateNativeCorpusAllocation,
} from "../qa/reference-image/native-corpus-data.mjs";
import {
  claimNativeCorpusCall,
  NATIVE_CORPUS_LIMITS,
} from "../qa/reference-image/native-corpus-transport.mjs";

const candidate = (id = "p0") => ({ status: "candidate", productIds: [id] });
const queryRows = () =>
  Array.from({ length: 45 }, (_, i) => ({
    id: `q-${i}`,
    role:
      i < 12
        ? "product"
        : i < 36
          ? "evaluation_negative"
          : i < 44
            ? "unresolved_identity"
            : "insufficient_gallery",
    ...(i < 12 ? { productId: "p0" } : {}),
    result: { status: "unknown" },
  }));
const goodRows = () => {
  const rows = queryRows();
  for (let i = 0; i < 7; i++) rows[i].result = candidate();
  return rows;
};
const prior = Array.from({ length: 7 }, (_, i) => `q-${i}`);
function allocation() {
  let i = 0;
  return Object.entries(NATIVE_CORPUS_COUNTS).flatMap(([role, count]) =>
    Array.from({ length: count }, (_, index) => {
      const n = i++,
        split =
          role === "calibration_only" || (role === "unresolved_identity" && index < 5)
            ? "train"
            : role === "evaluation_negative" || role === "unresolved_identity"
              ? "validation"
              : "source_upload";
      return {
        id: `r-${n}`,
        imageSha256: n.toString(16).padStart(64, "0"),
        file: `work/fixture-${n}.jpg`,
        bytes: 100,
        role,
        split,
        sourceFamily: `family-${n}`,
        ...(role === "reference"
          ? { productId: `p${Math.floor(index / 2)}` }
          : role === "product"
            ? { productId: "p0" }
            : role === "insufficient_gallery"
              ? { productId: "outside" }
              : {}),
        source: { licence: "CC0-1.0", reviewStatus: "source_asserted_pending_review" },
      };
    }),
  );
}
test("retains all93roles and45queries without claiming independent accuracy", () => {
  assert.equal(validateNativeCorpusAllocation(allocation()).evaluationQueries, 45);
  const result = summarizeNativeCorpus(goodRows(), prior);
  assert.equal(result.engineeringParityPassed, true);
  assert.equal(result.sourceAgreements, 7);
  assert.deepEqual(result.agreementProducts, ["p0"]);
  assert.equal(result.independentAccuracyEstablished, false);
  assert.equal(result.integrationAllowed, false);
});
test("refuses missing rows, duplicate IDs/hashes and changed denominators", () => {
  assert.throws(() => validateNativeCorpusAllocation(allocation().slice(1)));
  for (const key of ["id", "imageSha256"]) {
    const rows = allocation();
    rows[1][key] = rows[0][key];
    assert.throws(() => validateNativeCorpusAllocation(rows));
  }
  assert.throws(() => summarizeNativeCorpus(queryRows().slice(1), prior));
  const rows = queryRows();
  rows[1].id = rows[0].id;
  assert.throws(() => summarizeNativeCorpus(rows, prior));
});
test("never fits evaluation controls or leaks source families across splits", () => {
  const rows = allocation();
  rows.find((r) => r.role === "evaluation_negative").sourceFamily = rows.find(
    (r) => r.role === "calibration_only",
  ).sourceFamily;
  assert.throws(() => validateNativeCorpusAllocation(rows), /family_leakage/);
  const changed = allocation();
  changed.find((r) => r.role === "calibration_only").split = "validation";
  assert.throws(() => validateNativeCorpusAllocation(changed), /fit_leakage/);
});
test("requires exact catalogue membership, two references and outside sentinel", () => {
  for (const edit of [
    (r) => (r.find((x) => x.role === "reference").productId = "new"),
    (r) => (r.find((x) => x.role === "product").productId = "missing"),
    (r) => (r.find((x) => x.role === "insufficient_gallery").productId = "p0"),
  ]) {
    const rows = allocation();
    edit(rows);
    assert.throws(() => validateNativeCorpusAllocation(rows));
  }
});
test("rejects fake verified labels, missing licences/families and path traversal", () => {
  for (const edit of [
    (r) => (r[0].source.reviewStatus = "verified"),
    (r) => (r[0].source.licence = ""),
    (r) => (r[0].sourceFamily = ""),
    (r) => (r[0].file = "work/../private.jpg"),
  ]) {
    const rows = allocation();
    edit(rows);
    assert.throws(() => validateNativeCorpusAllocation(rows));
  }
});
test("needs seven agreements and preserves each earlier correct case", () => {
  const rows = goodRows();
  rows[6].result = { status: "unknown" };
  assert.equal(summarizeNativeCorpus(rows, prior).engineeringParityPassed, false);
  rows[7].result = candidate();
  const result = summarizeNativeCorpus(rows, prior);
  assert.equal(result.sourceAgreements, 7);
  assert.deepEqual(result.priorAgreementLosses, ["q-6"]);
  assert.equal(result.engineeringParityPassed, false);
});
test("a wrong product cannot hide behind increased aggregate coverage", () => {
  const rows = goodRows();
  rows[7].result = candidate("wrong");
  const result = summarizeNativeCorpus(rows, prior);
  assert.equal(result.sourceDisagreements, 1);
  assert.equal(result.engineeringParityPassed, false);
});
test("each evaluation, unresolved and insufficient-gallery non-unknown vetoes gate", () => {
  for (const index of [12, 36, 44])
    for (const result of [candidate(), { status: "ambiguous", productIds: ["p0", "p1"] }]) {
      const rows = goodRows();
      rows[index].result = result;
      assert.equal(summarizeNativeCorpus(rows, prior).engineeringParityPassed, false);
    }
});
test("required failures/unattempted results remain visible", () => {
  for (const result of [null, { status: "unavailable", reason: "timeout" }]) {
    const rows = goodRows();
    rows[20].result = result;
    const summary = summarizeNativeCorpus(rows, prior);
    assert.deepEqual(summary.failures, ["q-20"]);
    assert.equal(summary.planned, 45);
    assert.equal(summary.engineeringParityPassed, false);
  }
});
test("native call budgets are exact and reject unknown operations or retries", () => {
  const counters = { capabilities: 0, hashes: 0, encodes: 0, decodes: 0, processes: 0 };
  for (const kind of ["capabilities", "hashes", "encodes", "decodes"]) {
    for (let i = 0; i < NATIVE_CORPUS_LIMITS[kind]; i++)
      assert.match(claimNativeCorpusCall(counters, kind), /^--reference-/u);
    assert.throws(() => claimNativeCorpusCall(counters, kind), /call_budget/);
  }
  assert.equal(counters.processes, 480);
  assert.throws(() => claimNativeCorpusCall(counters, "download"), /unknown_operation/);
});
test("canonical stage prevents a second freeze or run before data/model work", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kig-native-corpus-"));
  fs.mkdirSync(path.join(root, "work"));
  fs.writeFileSync(path.join(root, "work/native-reference-corpus-v1-attempt.json"), "{}");
  await assert.rejects(freezeNativeCorpus("missing", "work/new", root), /already_attempted/);
  await assert.rejects(
    runNativeCorpus("missing", "a".repeat(64), "work/new", root),
    /already_attempted/,
  );
  assert.deepEqual(fs.readdirSync(path.join(root, "work")), [
    "native-reference-corpus-v1-attempt.json",
  ]);
});
