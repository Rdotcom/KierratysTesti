// Bounded public-source acquisition/review only. Never invokes a classifier.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkedImageUrl, fetchImage, readCorpusJson } from "./independent-corpus.mjs";

export const licences = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC-BY-3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
};
export const kinds = ["bottle", "jar", "box", "bag", "cup"];
const splits = ["validation", "heldout"];
const digest = (b) => createHash("sha256").update(b).digest("hex");
const plain = (v, n) =>
  typeof v === "string" && v.length > 0 && v.length <= n && !/[\p{Cc}\p{Cf}]/u.test(v);
const localJson = (name) => readCorpusJson(fileURLToPath(new URL(name, import.meta.url)), 524288);
const prior = localJson("./robustness-prior.json").value;
const agent =
  "KierratysAppi-robustness-QA/0.1 (https://github.com/roopeaal/KierratysAppi; bounded public diagnostic)";

export function validateCase(r) {
  assert.ok(r && typeof r === "object");
  assert.ok(plain(r.id, 64) && /^[a-z][a-z0-9-]+$/u.test(r.id), "invalid_id");
  assert.ok(plain(r.title, 512) && /^File:[^|/\\]+\.jpe?g$/iu.test(r.title), "invalid_title");
  assert.ok([...kinds, "unknown"].includes(r.expectedKind), "unsupported_kind");
  assert.ok(splits.includes(r.split), "invalid_split");
  assert.ok(plain(r.group, 120), "missing_group");
  assert.ok(plain(r.labelEvidence, 750), "missing_label_evidence");
  assert.ok(Object.hasOwn(licences, r.license), "unsupported_licence");
  assert.equal(typeof r.contextChallenge, "boolean");
  assert.equal(r.requiresNoSortingTruth, true, "sorting_truth_forbidden");
  assert.ok(
    !prior.fixtures.some((p) => p.title === r.title || p.group === r.group),
    "prior_source_or_group",
  );
  assert.ok(
    !prior.sourceFamilyTitlePatterns.some((p) => r.title.toLowerCase().includes(p.toLowerCase())),
    "prior_source_family",
  );
  return r;
}

function unique(records) {
  const ids = new Set(),
    titles = new Set(),
    groups = new Set(),
    families = new Map();
  for (const r of records) {
    validateCase(r);
    assert.ok(!ids.has(r.id), "duplicate_id");
    ids.add(r.id);
    assert.ok(!titles.has(r.title), "duplicate_source");
    titles.add(r.title);
    assert.ok(!groups.has(r.group), "duplicate_object_group");
    groups.add(r.group);
    const family = r.sourceFamily ?? r.group;
    assert.ok(plain(family, 120), "invalid_source_family");
    if (families.has(family))
      assert.equal(families.get(family), r.split, "source_family_split_leakage");
    families.set(family, r.split);
  }
}

export function validateSpecification(s) {
  assert.equal(s?.schemaVersion, "robustness-cases-v1");
  assert.equal(s.labelReviewStatus, "ai_reviewed_human_review_required");
  assert.equal(s.pretrainingMembership, "unknown");
  assert.equal(s.trainingExecuted, false);
  assert.equal(s.inferenceExecuted, false);
  assert.equal(s.maximumNewImages, 60);
  assert.equal(s.maximumNewBytes, 35000000);
  assert.ok(Array.isArray(s.cases) && s.cases.length > 0 && s.cases.length <= 60);
  unique(s.cases);
  return s;
}

export function coverage(fixtures) {
  return Object.fromEntries(
    splits.map((s) => [
      s,
      Object.fromEntries(
        [...kinds, "unknown"].map((k) => [
          k,
          fixtures.filter((r) => r.split === s && r.expectedKind === k).length,
        ]),
      ),
    ]),
  );
}

function validateFixture(r) {
  validateCase(r);
  const planned = [
    ...localJson("./robustness-cases.json").value.cases,
    ...localJson("./robustness-supplement-cases.json").value.cases,
  ].find((p) => p.id === r.id);
  assert.ok(planned, "unplanned_fixture");
  for (const key of ["title", "expectedKind", "group", "license", "contextChallenge"])
    assert.equal(r[key], planned[key], "fixture_reference_changed");
  assert.equal(r.seenDiagnostic, false, "seen_data_forbidden");
  assert.match(r.sha256, /^[a-f0-9]{64}$/u);
  assert.match(r.sourceSha1, /^[a-f0-9]{40}$/u);
  assert.ok(Number.isInteger(r.bytes) && r.bytes >= 12 && r.bytes <= 1500000, "invalid_bytes");
  assert.ok(plain(r.author, 700), "missing_credit");
  assert.ok(plain(r.credit, 2500), "missing_credit_notice");
  assert.equal(r.licenseUrl, licences[r.license]);
  checkedImageUrl(r.downloadUrl);
  const u = new URL(r.pageUrl);
  assert.equal(u.origin, "https://commons.wikimedia.org");
  assert.ok(
    u.pathname.startsWith("/wiki/File:") && !u.search && !u.hash && !u.username && !u.password,
    "invalid_page",
  );
  assert.ok(plain(r.changes, 500));
  assert.ok(
    !prior.fixtures.some((p) => p.sha256 === r.sha256 || p.sourceSha1 === r.sourceSha1),
    "prior_bytes_or_source",
  );
}

export function validateManifest(m) {
  assert.equal(m?.schemaVersion, "robustness-manifest-v1");
  assert.equal(m.labelReviewStatus, "ai_reviewed_human_review_required");
  assert.equal(m.pretrainingMembership, "unknown");
  assert.equal(m.trainingExecuted, false);
  assert.equal(m.inferenceExecuted, false);
  assert.equal(m.visualReviewStatus, "ai_visual_review_human_review_required");
  const reviewed = localJson("./robustness-review.json");
  assert.equal(m.reviewSha256, digest(reviewed.bytes), "review_bytes_changed");
  assert.equal(
    m.priorManifestSha256,
    digest(localJson("./robustness-prior.json").bytes),
    "prior_bytes_changed",
  );
  assert.ok(Array.isArray(m.fixtures) && m.fixtures.length === 32, "expected_32_eligible");
  unique(m.fixtures);
  const hashes = new Set(),
    sources = new Set();
  for (const r of m.fixtures) {
    validateFixture(r);
    const reference = reviewed.value.cases.find((c) => c.id === r.id);
    assert.equal(reference?.eligible, true, "unreviewed_fixture");
    assert.equal(r.split, reference.split, "reviewed_split_changed");
    assert.equal(r.reviewNote, reference.reason, "reviewed_label_changed");
    assert.equal(r.labelEvidence, reference.reason, "reviewed_evidence_changed");
    assert.equal(r.sourceFamily, reference.sourceFamily ?? r.group, "reviewed_family_changed");
    assert.equal(r.privacyReview, "no_identifiable_person_or_private_text_observed");
    assert.ok(plain(r.reviewNote, 1000));
    assert.ok(!hashes.has(r.sha256), "duplicate_bytes");
    hashes.add(r.sha256);
    assert.ok(!sources.has(r.sourceSha1), "duplicate_original_source");
    sources.add(r.sourceSha1);
  }
  assert.deepEqual(m.coverage, coverage(m.fixtures));
  for (const s of splits) {
    for (const k of kinds) assert.equal(m.coverage[s][k], 2, "imbalanced_positive");
    assert.equal(m.coverage[s].unknown, 6, "imbalanced_controls");
  }
  assert.equal(m.acquisitionBudget.maximumNewImages, 60);
  assert.equal(m.acquisitionBudget.maximumNewBytes, 35000000);
  assert.ok(
    m.acquisitionBudget.newImagesDownloaded >= m.fixtures.length &&
      m.acquisitionBudget.newImagesDownloaded <= 60,
  );
  assert.ok(
    m.acquisitionBudget.newBytesDownloaded <= 35000000 &&
      m.acquisitionBudget.newBytesDownloaded >= m.fixtures.reduce((n, r) => n + r.bytes, 0),
  );
  assert.match(m.reviewSha256, /^[a-f0-9]{64}$/u);
  assert.match(m.candidateManifestSha256, /^[a-f0-9]{64}$/u);
  return m;
}

// Manifest first for evaluation callers. No inference may depend on source text.
export function validateLocal(manifest, directory) {
  validateManifest(manifest);
  const root = fs.realpathSync(directory);
  assert.equal(root, path.resolve(directory), "linked_fixture_directory");
  for (const r of manifest.fixtures) {
    const file = path.join(root, `${r.id}.jpg`),
      stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), "linked_or_nonfile_image");
    assert.equal(fs.realpathSync(file), file);
    assert.equal(stat.size, r.bytes);
    const bytes = fs.readFileSync(file, {
      flag: fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    });
    assert.equal(digest(bytes), r.sha256, "fixture_hash_changed");
    assert.ok(
      bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217,
      "invalid_jpeg",
    );
  }
  return manifest;
}

function newOutput(input, cwd) {
  assert.ok(plain(input, 1024) && !/^[a-z]+:/iu.test(input), "invalid_output");
  const work = fs.realpathSync(path.join(cwd, "work")),
    out = path.resolve(cwd, input),
    parent = fs.realpathSync(path.dirname(out));
  assert.ok(parent === work || parent.startsWith(`${work}${path.sep}`), "outside_work");
  assert.equal(fs.existsSync(out), false, "output_exists");
  return out;
}
const clean = (v, max) =>
  String(v ?? "")
    .replace(/<[^>]*>/gu, " ")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);

async function metadata(spec) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    titles: spec.cases.map((r) => r.title).join("|"),
    prop: "imageinfo",
    iiprop: "url|extmetadata|sha1|timestamp",
    iiurlwidth: "768",
  });
  const res = await fetch(url, {
    headers: { "User-Agent": agent },
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  assert.ok(res.ok, `metadata_http_${res.status}`);
  const parts = [];
  let n = 0;
  for await (const p of res.body) {
    n += p.length;
    assert.ok(n <= 2000000, "metadata_too_large");
    parts.push(p);
  }
  const bytes = Buffer.concat(parts),
    raw = JSON.parse(bytes),
    pages = new Map(Object.values(raw.query?.pages ?? {}).map((p) => [p.title, p]));
  return {
    bytes,
    records: spec.cases.map((r) => {
      const i = pages.get(r.title)?.imageinfo?.[0];
      assert.ok(i, "source_missing");
      const m = i.extmetadata;
      assert.equal(
        m?.LicenseShortName?.value,
        r.license === "CC0-1.0" ? "CC0" : r.license.replace("CC-BY-", "CC BY "),
        "licence_changed",
      );
      const image = new URL(i.thumburl ?? i.url);
      image.search = "";
      return {
        ...r,
        author: clean(m.Artist?.value, 700),
        credit: clean(
          [m.Credit?.value, m.Attribution?.value].filter(Boolean).join(" | ") || m.Artist?.value,
          2500,
        ),
        sourceDescription: clean(m.ImageDescription?.value, 1000),
        licenseUrl: licences[r.license],
        pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(r.title.replaceAll(" ", "_")).replace("File%3A", "File:")}`,
        downloadUrl: checkedImageUrl(image.href).href,
        sourceSha1: i.sha1,
        sourceTimestamp: i.timestamp,
        seenDiagnostic: false,
        changes:
          "Commons thumbnail resize only; no crop or retouch. AI reference label only, not material, safety or sorting verification.",
      };
    }),
  };
}

export async function acquire(outputInput, cwd = process.cwd(), supplement = false) {
  const input = localJson(
      supplement ? "./robustness-supplement-cases.json" : "./robustness-cases.json",
    ),
    spec = validateSpecification(input.value),
    out = newOutput(outputInput, cwd),
    prepared = await metadata(spec);
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, "metadata.json"), prepared.bytes, { flag: "wx" });
  fs.writeFileSync(
    path.join(out, "started.json"),
    JSON.stringify(
      {
        startedAt: new Date().toISOString(),
        specificationSha256: digest(input.bytes),
        plannedNewImages: prepared.records.length,
        maximumNewImages: 60,
        maximumNewBytes: 35000000,
        trainingCalls: 0,
        inferenceCalls: 0,
        retries: 0,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const fixtures = [];
  let total = 0;
  for (const r of prepared.records) {
    assert.ok(
      !prior.fixtures.some((p) => p.title === r.title || p.sourceSha1 === r.sourceSha1),
      "prior_source",
    );
    const bytes = await fetchImage(r.downloadUrl);
    total += bytes.length;
    assert.ok(total <= 35000000, "download_budget");
    const record = { ...r, bytes: bytes.length, sha256: digest(bytes) };
    validateFixture(record);
    assert.ok(
      !fixtures.some((p) => p.sha256 === record.sha256 || p.sourceSha1 === record.sourceSha1),
      "duplicate_download",
    );
    fs.writeFileSync(path.join(out, `${r.id}.jpg`), bytes, { flag: "wx" });
    fixtures.push(record);
    console.log(JSON.stringify({ downloaded: r.id, bytes: bytes.length, totalBytes: total }));
  }
  const manifest = {
    schemaVersion: "robustness-candidates-v1",
    specificationSha256: digest(input.bytes),
    metadataSha256: digest(prepared.bytes),
    preparedAt: new Date().toISOString(),
    trainingExecuted: false,
    inferenceExecuted: false,
    fixtures,
  };
  fs.writeFileSync(path.join(out, "fixtures.json"), JSON.stringify(manifest, null, 2) + "\n", {
    flag: "wx",
  });
  return { directory: out, images: fixtures.length, bytes: total, inferenceCalls: 0 };
}

export function mergeCandidates(inputs, outputInput, cwd = process.cwd()) {
  assert.ok(Array.isArray(inputs) && inputs.length === 2, "two_explicit_batches_required");
  const out = newOutput(outputInput, cwd),
    parts = inputs.map((f) => ({
      file: path.resolve(cwd, f),
      ...readCorpusJson(path.resolve(cwd, f), 524288),
    }));
  const fixtures = parts.flatMap((p) => {
    assert.equal(p.value.schemaVersion, "robustness-candidates-v1");
    assert.equal(p.value.trainingExecuted, false);
    assert.equal(p.value.inferenceExecuted, false);
    return p.value.fixtures;
  });
  assert.ok(fixtures.length <= 60, "image_budget");
  assert.ok(fixtures.reduce((n, r) => n + r.bytes, 0) <= 35000000, "byte_budget");
  unique(fixtures);
  const hashes = new Set(),
    sources = new Set();
  for (const r of fixtures) {
    validateFixture(r);
    assert.ok(!hashes.has(r.sha256) && !sources.has(r.sourceSha1), "duplicate_batch_image");
    hashes.add(r.sha256);
    sources.add(r.sourceSha1);
  }
  fs.mkdirSync(out);
  for (const p of parts)
    for (const r of p.value.fixtures) {
      const file = path.join(path.dirname(p.file), `${r.id}.jpg`),
        stat = fs.lstatSync(file);
      assert.ok(stat.isFile() && !stat.isSymbolicLink());
      const bytes = fs.readFileSync(file);
      assert.equal(bytes.length, r.bytes);
      assert.equal(digest(bytes), r.sha256);
      fs.writeFileSync(path.join(out, `${r.id}.jpg`), bytes, { flag: "wx" });
    }
  const merged = {
    schemaVersion: "robustness-candidates-v1",
    sourceManifests: parts.map((p) => ({
      path: path.relative(cwd, p.file),
      sha256: digest(p.bytes),
      specificationSha256: p.value.specificationSha256,
      metadataSha256: p.value.metadataSha256,
    })),
    preparedAt: new Date().toISOString(),
    trainingExecuted: false,
    inferenceExecuted: false,
    fixtures,
  };
  fs.writeFileSync(path.join(out, "fixtures.json"), JSON.stringify(merged, null, 2) + "\n", {
    flag: "wx",
  });
  return {
    directory: out,
    images: fixtures.length,
    bytes: fixtures.reduce((n, r) => n + r.bytes, 0),
    inferenceCalls: 0,
  };
}

export function freezeReviewed(candidateInput, reviewInput, outputInput, cwd = process.cwd()) {
  const candidates = readCorpusJson(path.resolve(cwd, candidateInput), 524288),
    reviewFile = readCorpusJson(path.resolve(cwd, reviewInput), 262144),
    review = reviewFile.value;
  assert.equal(candidates.value.schemaVersion, "robustness-candidates-v1");
  assert.equal(candidates.value.trainingExecuted, false);
  assert.equal(candidates.value.inferenceExecuted, false);
  assert.equal(review.schemaVersion, "robustness-review-v1");
  assert.equal(review.reviewedBeforeInference, true);
  assert.equal(review.reviewStatus, "ai_visual_review_human_review_required");
  assert.ok(Array.isArray(review.cases));
  assert.equal(review.cases.length, candidates.value.fixtures.length);
  assert.equal(new Set(review.cases.map((r) => r.id)).size, review.cases.length);
  const fixtures = [];
  for (const r of candidates.value.fixtures) {
    validateFixture(r);
    const note = review.cases.find((c) => c.id === r.id);
    assert.ok(note, "missing_review");
    assert.equal(typeof note.eligible, "boolean");
    assert.ok(plain(note.reason, 1000), "missing_review_reason");
    if (!note.eligible) continue;
    assert.equal(note.privacyReview, "no_identifiable_person_or_private_text_observed");
    assert.ok(splits.includes(note.split));
    fixtures.push({
      ...r,
      split: note.split,
      sourceFamily: note.sourceFamily ?? r.group,
      labelEvidence: note.reason,
      reviewNote: note.reason,
      privacyReview: note.privacyReview,
    });
  }
  const manifest = {
    schemaVersion: "robustness-manifest-v1",
    purpose:
      "Coarse visible-form robustness diagnostic only, never exact identity, composition, packaging, safety, deposit or sorting truth.",
    labelReviewStatus: "ai_reviewed_human_review_required",
    visualReviewStatus: "ai_visual_review_human_review_required",
    pretrainingMembership: "unknown",
    trainingExecuted: false,
    inferenceExecuted: false,
    frozenAt: new Date().toISOString(),
    candidateManifestSha256: digest(candidates.bytes),
    reviewSha256: digest(reviewFile.bytes),
    priorManifestSha256: digest(localJson("./robustness-prior.json").bytes),
    acquisitionSources: candidates.value.sourceManifests,
    acquisitionBudget: {
      newImagesDownloaded: candidates.value.fixtures.length,
      newBytesDownloaded: candidates.value.fixtures.reduce((n, r) => n + r.bytes, 0),
      maximumNewImages: 60,
      maximumNewBytes: 35000000,
    },
    coverage: coverage(fixtures),
    limitations: review.limitations,
    excluded: review.cases.filter((r) => !r.eligible),
    fixtures,
  };
  validateManifest(manifest);
  const out = newOutput(outputInput, cwd),
    source = path.dirname(path.resolve(cwd, candidateInput));
  fs.mkdirSync(out);
  for (const r of fixtures) {
    const file = path.join(source, `${r.id}.jpg`),
      stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.length, r.bytes);
    assert.equal(digest(bytes), r.sha256);
    fs.writeFileSync(path.join(out, `${r.id}.jpg`), bytes, { flag: "wx" });
  }
  validateLocal(manifest, out);
  fs.writeFileSync(path.join(out, "fixtures.json"), JSON.stringify(manifest, null, 2) + "\n", {
    flag: "wx",
  });
  fs.writeFileSync(path.join(out, "review.json"), reviewFile.bytes, { flag: "wx" });
  return {
    directory: out,
    manifestSha256: digest(fs.readFileSync(path.join(out, "fixtures.json"))),
    images: fixtures.length,
    coverage: manifest.coverage,
    inferenceCalls: 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (["--acquire", "--acquire-supplement"].includes(process.argv[2])) {
      assert.equal(process.argv.length, 4);
      console.log(
        JSON.stringify(
          await acquire(process.argv[3], process.cwd(), process.argv[2] === "--acquire-supplement"),
          null,
          2,
        ),
      );
    } else if (process.argv[2] === "--review") {
      assert.equal(process.argv.length, 6);
      console.log(
        JSON.stringify(freezeReviewed(process.argv[3], process.argv[4], process.argv[5]), null, 2),
      );
    } else throw Error("explicit_acquire_or_review_required");
  } catch (e) {
    console.error(e instanceof Error ? e.message : "robustness_failed");
    process.exitCode = 1;
  }
}
