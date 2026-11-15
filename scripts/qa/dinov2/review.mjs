// Independent built-ins-only arithmetic. Does not execute Python or a model.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
export function vector(value) {
  assert.ok(Array.isArray(value) && value.length === 384 && value.every(Number.isFinite));
  const norm = Math.sqrt(value.reduce((n, v) => n + v * v, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6);
  return value;
}
export function rankVector(query, references) {
  vector(query);
  assert.equal(references.length, 10);
  const products = new Map();
  for (const r of references) {
    vector(r.vector);
    assert.ok(typeof r.productId === "string" && r.productId.startsWith("off-"));
    const cosine = query.reduce((s, v, i) => s + v * r.vector[i], 0);
    products.set(r.productId, Math.max(products.get(r.productId) ?? -2, cosine));
  }
  assert.equal(products.size, 5);
  return [...products]
    .map(([productId, cosine]) => ({ productId, cosine }))
    .sort(
      (a, b) =>
        b.cosine - a.cosine || (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0),
    );
}
export function summarize(rows, baseline) {
  const known = rows.filter((r) => r.role === "product_query");
  assert.equal(known.length, 17);
  const oldKnown = baseline.observations.filter((r) => r.role === "product_query");
  assert.equal(oldKnown.length, 17);
  assert.equal(new Set(known.map((r) => r.id)).size, 17);
  const isCorrect = (r) => typeof r.expected === "string" && r.rank[0]?.productId === r.expected;
  let previousCorrect = 0;
  const losses = [],
    gains = [],
    paired = [];
  for (const r of known) {
    const old = oldKnown.find((o) => o.id === r.id);
    assert.ok(old && old.expectedSourceProductId === r.expected);
    const oldRank = old.resolved?.ranking ?? [];
    const oldCorrect = typeof r.expected === "string" && oldRank[0]?.productId === r.expected;
    if (oldCorrect) previousCorrect++;
    if (oldCorrect && !isCorrect(r)) losses.push(r.id);
    if (!oldCorrect && isCorrect(r)) gains.push(r.id);
    if (oldRank.length && r.rank.length) paired.push({ oldCorrect, newCorrect: isCorrect(r) });
  }
  const top1 = known.filter(isCorrect).length;
  const failures = rows.filter((r) => r.failure).map((r) => r.id);
  return {
    known: 17,
    audit: rows.filter((r) => r.role === "safety_audit").length,
    baselineTop1: previousCorrect,
    top1,
    top1Rate: top1 / 17,
    recall5: known.filter((r) => r.rank.some((x) => x.productId === r.expected)).length,
    pairedKnown: paired.length,
    pairedOldTop1: paired.filter((r) => r.oldCorrect).length,
    pairedNewTop1: paired.filter((r) => r.newCorrect).length,
    losses,
    gains,
    failures,
    improvementGate: top1 >= 14 && losses.length === 0 && failures.length === 0 ? "PASS" : "FAIL",
    automaticAccepts: 0,
    acceptedPrecision: null,
    automaticCoverage: 0,
    publicReleaseGate: "FAIL",
    populationConfidenceEstablished: false,
  };
}
export function review(directory) {
  const base = path.resolve(root, directory);
  assert.ok(base.startsWith(`${root}work/`) && fs.realpathSync(base) === base);
  function read(file) {
    const full = path.resolve(root, file),
      stat = fs.lstatSync(full);
    assert.ok(
      full.startsWith(root) &&
        fs.realpathSync(full) === full &&
        stat.isFile() &&
        stat.nlink === 1 &&
        stat.size < 100_000_000,
    );
    assert.ok(!/(?:^|\/)\.env(?:\.|$)|\.pem$|\.key$/u.test(file));
    return fs.readFileSync(full);
  }
  const lockBytes = read(path.join(base, "lock.json")),
    lock = JSON.parse(lockBytes);
  assert.equal(lock.version, "dinov2-small-comparison-v1");
  for (const [file, identity] of Object.entries(lock.pins))
    assert.equal(sha(read(file)), identity, file);
  const raw = JSON.parse(read(path.join(base, "raw.json")));
  assert.equal(raw.lockSha256, sha(lockBytes));
  assert.equal(raw.device, "cpu");
  assert.equal(raw.dtype, "float32");
  assert.equal(raw.dimensions, 384);
  assert.equal(raw.observations.length, 68);
  assert.equal(lock.rows.length, 68);
  assert.equal(new Set(raw.observations.map((r) => r.id)).size, 68);
  assert.equal(raw.rankings.length, 58);
  assert.equal(new Set(raw.rankings.map((r) => r.id)).size, 58);
  const joined = lock.rows.map((r, i) => {
    const item = raw.observations[i];
    assert.equal(item.id, r.id);
    assert.equal(item.imageSha256, r.imageSha256);
    assert.equal(sha(read(r.file)), r.imageSha256);
    assert.deepEqual(JSON.parse(read(path.join(base, `${r.id}.json`))), item);
    assert.ok(Number.isFinite(item.durationMs) && item.durationMs >= 0);
    assert.ok(Number.isInteger(item.maximumProcessRssBytes) && item.maximumProcessRssBytes > 0);
    if (item.failure === null) vector(item.vector);
    else assert.ok(typeof item.failure === "string" && item.vector === null);
    return { ...item, productId: r.productId, role: r.allocationRole, expected: r.productId };
  });
  const references = joined.filter((r) => r.role === "reference");
  assert.equal(references.length, 10);
  const validReferences = references.every((r) => r.failure === null);
  const compared = joined.map((r) => {
    const rank =
      r.role !== "reference" && validReferences && r.failure === null
        ? rankVector(r.vector, references)
        : [];
    if (r.role !== "reference") {
      const other = raw.rankings.find((x) => x.id === r.id);
      assert.ok(other && other.rank.length === rank.length);
      for (let i = 0; i < rank.length; i++) {
        assert.equal(other.rank[i].productId, rank[i].productId);
        assert.ok(Math.abs(other.rank[i].cosine - rank[i].cosine) < 1e-10);
      }
    }
    return {
      id: r.id,
      role: r.role,
      expected: r.expected ?? null,
      failure: r.failure,
      durationMs: r.durationMs,
      rank,
      margin: rank.length > 1 ? rank[0].cosine - rank[1].cosine : null,
    };
  });
  const metrics = summarize(compared, JSON.parse(read(lock.baselineFile)));
  assert.equal(metrics.audit, 41);
  assert.equal(metrics.baselineTop1, 11);
  const times = joined
    .filter((r) => r.failure === null)
    .map((r) => r.durationMs)
    .sort((a, b) => a - b);
  const p = (fraction) => times[Math.max(0, Math.ceil(times.length * fraction) - 1)] ?? null;
  const pilots = lock.pilots.map((r) => ({
    id: r.pilotQuery,
    sourceAgreement:
      compared.find((x) => x.id === r.pilotQuery)?.rank[0]?.productId === r.productId,
  }));
  const process = JSON.parse(read(path.join(base, "process.json")));
  assert.equal(process.status, 0);
  assert.equal(process.error, null);
  const probe = JSON.parse(read(path.join(base, "network-probe.json")));
  assert.ok(Number.isInteger(probe.status) && probe.status !== 0 && probe.stdoutBytes === 0);
  return {
    lockSha256: sha(lockBytes),
    rawSha256: sha(read(path.join(base, "raw.json"))),
    pinsVerified: Object.keys(lock.pins).length,
    metrics,
    pilots,
    latencyMs: {
      n: times.length,
      p50: p(0.5),
      p95: p(0.95),
      max: p(1),
      modelLoad: raw.modelLoadMs,
    },
    maximumProcessRssBytes: Math.max(...joined.map((r) => r.maximumProcessRssBytes)),
    rows: compared.filter((r) => r.role !== "reference"),
    independentModelCalls: 0,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = review(process.argv[2]);
  if (process.argv[3]) {
    const destination = path.resolve(root, process.argv[3]);
    assert.ok(
      destination.startsWith(`${root}work/`) &&
        fs.realpathSync(path.dirname(destination)) === path.dirname(destination),
    );
    fs.writeFileSync(destination, JSON.stringify(result, null, 2), { flag: "wx" });
  }
  console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
}
