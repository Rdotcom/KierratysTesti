import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  createContinuationTransport,
  queryObservation,
} from "../qa/reference-image/expanded-continuation.mjs";
import { EXPANDED_ALLOCATION } from "../qa/reference-image/allocate-expanded-corpus.mjs";
import {
  freezeExpandedCorpus,
  expandedInputPath,
  runExpandedCorpus,
  summarizeExpandedCorpus,
} from "../qa/reference-image/evaluate-expanded-corpus.mjs";
import {
  claimExpandedCorpusCall,
  claimNativeCorpusCall,
  EXPANDED_CORPUS_LIMITS,
} from "../qa/reference-image/native-corpus-transport.mjs";

const candidate = (productId) => ({ status: "candidate", productIds: [productId] });
function fixture() {
  const rows = EXPANDED_ALLOCATION.map((p) => ({
    id: p.pilotQuery,
    productId: p.productId,
    allocationRole: "product_query",
    result: candidate(p.productId),
  }));
  for (let i = 0; i < 12; i++)
    rows.push({
      id: `old-${i}`,
      productId: "off-8076800195057",
      allocationRole: "product_query",
      result:
        i < 9
          ? candidate("off-8076800195057")
          : { status: "ambiguous", productIds: ["off-3017620422003", "off-4008400404127"] },
    });
  for (let i = 0; i < 41; i++)
    rows.push({ id: `audit-${i}`, allocationRole: "safety_audit", result: { status: "unknown" } });
  return rows;
}
const prior = Array.from({ length: 7 }, (_, i) => `old-${i}`);
test("optional control metadata is absent rather than undefined in strict JSON", () => {
  const r = queryObservation({
    id: "a",
    allocationRole: "safety_audit",
    imageSha256: "0".repeat(64),
  });
  assert.deepEqual(Object.keys(r).sort(), ["id", "allocationRole", "imageSha256", "result"].sort());
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});
test("continuation consumes only authenticated prefix and refuses changed input without native calls", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kig-expanded-prefix-"))),
    dir = "work/prefix";
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  const hash = (b) => createHash("sha256").update(b).digest("hex"),
    pins = {},
    parentSha256 = "1".repeat(64);
  const save = (name, value) => {
    const b = Buffer.from(typeof value === "string" ? value : JSON.stringify(value)),
      file = `${dir}/${name}`;
    fs.writeFileSync(path.join(root, file), b);
    pins[file] = hash(b);
    return file;
  };
  const stdout = save("process-0.stdout", '"cached"\n');
  save("process-0-attempt.json", {
    kind: "hashes",
    command: "--reference-hash-stdin",
    lockSha256: parentSha256,
    inputSha256: hash(Buffer.from("x")),
  });
  save("process-0-result.json", {
    kind: "hashes",
    status: 0,
    reason: null,
    stdout: { file: stdout, sha256: pins[stdout] },
  });
  const transport = () =>
    createContinuationTransport(
      {
        root,
        binary: "/nonexistent",
        resource: "/nonexistent",
        output: "/nonexistent",
        lockSha256: "2".repeat(64),
      },
      { directory: dir, prefixProcesses: 1, parentSha256, pins },
    );
  const t = transport();
  assert.equal(await t.call("hashes", Buffer.from("x").toString("base64")), '"cached"');
  assert.equal(t.counters.processes, 1);
  await assert.rejects(
    transport().call("hashes", Buffer.from("y").toString("base64")),
    /prefix_input_mismatch/,
  );
  await assert.rejects(transport().call("encodes", Buffer.from("x").toString("base64")));
});
test("only exact visual-review document may be read outside work", () => {
  assert.equal(
    expandedInputPath("docs/final/OFF_EXPANSION_VISUAL_REVIEW.json", "/repo"),
    "/repo/docs/final/OFF_EXPANSION_VISUAL_REVIEW.json",
  );
  for (const f of [".env", "docs/final/../../.env", "/private/key", "docs/final/other.json"])
    assert.throws(() => expandedInputPath(f, "/repo"));
});
test("fixed gate needs fourteen agreements, every pilot and all58rows", () => {
  const r = summarizeExpandedCorpus(fixture(), prior);
  assert.equal(r.qualityGatePassed, true);
  assert.equal(r.sourceAgreements, 14);
  assert.equal(r.perProduct.length, 5);
  assert.equal(r.integrationAllowed, false);
  assert.equal(r.independentAccuracyEstablished, false);
  assert.throws(() => summarizeExpandedCorpus(fixture().slice(1), prior));
  const rows = fixture();
  rows[1].id = rows[0].id;
  assert.throws(() => summarizeExpandedCorpus(rows, prior), /duplicate_query/);
});
test("all-abstain or one-SKU-only cannot pass", () => {
  for (const all of [true, false]) {
    const rows = fixture();
    for (const r of rows)
      if (r.allocationRole === "product_query" && (all || r.productId !== "off-8076800195057"))
        r.result = { status: "unknown" };
    assert.equal(summarizeExpandedCorpus(rows, prior).qualityGatePassed, false);
  }
});
test("a wrong source, missing pilot or prior correct loss fails despite aggregate coverage", () => {
  for (const index of [0, 5]) {
    const rows = fixture();
    rows[index].result = candidate("wrong");
    const r = summarizeExpandedCorpus(rows, prior);
    assert.equal(r.qualityGatePassed, false);
    assert.equal(r.sourceDisagreements, 1);
  }
  const rows = fixture();
  rows[5].result = { status: "unknown" };
  rows[16].result = candidate(rows[16].productId);
  const r = summarizeExpandedCorpus(rows, prior);
  assert.equal(r.sourceAgreements, 14);
  assert.deepEqual(r.priorAgreementLosses, ["old-0"]);
  assert.equal(r.qualityGatePassed, false);
});
test("each audit role includes ambiguity and missing work in the failure denominator", () => {
  for (const result of [
    candidate("off-8076800195057"),
    { status: "ambiguous" },
    null,
    { status: "unavailable" },
  ]) {
    const rows = fixture();
    rows[57].result = result;
    const r = summarizeExpandedCorpus(rows, prior);
    assert.equal(r.qualityGatePassed, false);
    assert.equal(r.planned, 58);
    assert.equal(r.safetyNonUnknowns.length, 1);
  }
});
test("expanded budgets are exact and do not enlarge the historical allowance", () => {
  const c = { capabilities: 0, hashes: 0, encodes: 0, decodes: 0, processes: 0 };
  for (const kind of ["capabilities", "hashes", "encodes", "decodes"]) {
    for (let i = 0; i < EXPANDED_CORPUS_LIMITS[kind]; i++) claimExpandedCorpusCall(c, kind);
    assert.throws(() => claimExpandedCorpusCall(c, kind), /call_budget/);
  }
  assert.equal(c.processes, 538);
  assert.throws(() => claimExpandedCorpusCall(c, "network"), /unknown_operation/);
  assert.throws(
    () =>
      claimNativeCorpusCall(
        { capabilities: 0, hashes: 0, encodes: 93, decodes: 0, processes: 93 },
        "encodes",
      ),
    /call_budget/,
  );
});
test("canonical stage refuses repeat freeze/run before data, predictions or output", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kig-expanded-corpus-"));
  fs.mkdirSync(path.join(root, "work"));
  fs.writeFileSync(path.join(root, "work/expanded-native-corpus-v1-attempt.json"), "{}");
  await assert.rejects(freezeExpandedCorpus("missing", "work/new", root), /already_attempted/);
  await assert.rejects(
    runExpandedCorpus("missing", "a".repeat(64), "work/new", root),
    /already_attempted/,
  );
  assert.equal(fs.existsSync(path.join(root, "work/new")), false);
});
