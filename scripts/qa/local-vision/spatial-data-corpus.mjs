// Explicit public-source acquisition/review. No classifier is called here.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkedImageUrl, fetchImage, readCorpusJson } from "./independent-corpus.mjs";

export const kinds = ["bottle", "jar", "box", "bag", "cup"];
export const licences = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC-BY-3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
};
const hash = (b) => createHash("sha256").update(b).digest("hex");
const plain = (v, n) =>
  typeof v === "string" && v.length > 0 && v.length <= n && !/[\p{Cc}\p{Cf}]/u.test(v);
const local = (name) => readCorpusJson(fileURLToPath(new URL(name, import.meta.url)), 1_000_000);
const clean = (v, n) =>
  String(v ?? "")
    .replace(/<[^>]*>/gu, " ")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, n);
const prior = () => local("./spatial-data-prior.json").value;

export function validateCase(r) {
  assert.ok(r && typeof r === "object" && !Array.isArray(r));
  assert.ok(plain(r.id, 64) && /^[a-z][a-z0-9-]+$/u.test(r.id));
  assert.ok(plain(r.title, 512) && /^File:[^|/\\]+\.jpe?g$/iu.test(r.title));
  assert.equal(r.split, "confirmatory");
  assert.ok([...kinds, "unknown"].includes(r.expectedKind));
  assert.ok(["form", "mixed", "outside"].includes(r.challenge));
  assert.equal(r.challenge === "form", r.expectedKind !== "unknown");
  assert.equal(r.requiresNoSortingTruth, true);
  assert.ok(plain(r.group, 150) && plain(r.sourceFamily ?? r.group, 150));
  assert.ok(Object.hasOwn(licences, r.license));
  const p = prior();
  assert.ok(
    !p.fixtures.some((x) => x.title === r.title || x.group === r.group),
    "prior_source_or_group",
  );
  assert.ok(
    !p.fixtures.some((x) => (x.sourceFamily ?? x.group) === (r.sourceFamily ?? r.group)),
    "prior_source_family_group",
  );
  assert.ok(
    !p.sourceFamilyTitlePatterns.some((x) => r.title.toLowerCase().includes(x.toLowerCase())),
    "prior_source_family",
  );
  return r;
}

function unique(rows) {
  for (const key of ["id", "title", "group"])
    assert.equal(new Set(rows.map((r) => r[key])).size, rows.length, `duplicate_${key}`);
  assert.equal(
    new Set(rows.map((r) => r.sourceFamily ?? r.group)).size,
    rows.length,
    "duplicate_source_family",
  );
  for (const r of rows) validateCase(r);
}
export function validateSpecification(s) {
  assert.equal(s.schemaVersion, "spatial-data-cases-v1");
  assert.equal(s.labelReviewStatus, "ai_reviewed_human_review_required");
  assert.equal(s.pretrainingMembership, "unknown");
  assert.equal(s.trainingExecuted, false);
  assert.equal(s.inferenceExecuted, false);
  assert.equal(s.maximumNewImages, 40);
  assert.equal(s.maximumNewBytes, 25_000_000);
  assert.ok(Array.isArray(s.cases) && s.cases.length > 0 && s.cases.length <= 40);
  unique(s.cases);
  return s;
}
function fixture(r) {
  validateCase(r);
  const planned = local("./spatial-data-cases.json").value.cases.find((x) => x.id === r.id);
  assert.ok(planned, "unplanned_fixture");
  for (const key of ["title", "group", "expectedKind", "challenge", "license"])
    assert.equal(r[key], planned[key], "reference_changed");
  assert.equal(r.seenDiagnostic, false);
  assert.match(r.sha256, /^[a-f0-9]{64}$/u);
  assert.match(r.sourceSha1, /^[a-f0-9]{40}$/u);
  assert.ok(Number.isInteger(r.bytes) && r.bytes > 12 && r.bytes <= 1_500_000);
  assert.ok(plain(r.author, 700) && plain(r.credit, 2500));
  assert.ok(
    !prior().excludedPublishers.some((name) => r.author.toLowerCase().includes(name.toLowerCase())),
    "prior_publisher_series",
  );
  assert.equal(r.licenseUrl, licences[r.license]);
  checkedImageUrl(r.downloadUrl);
  const url = new URL(r.pageUrl);
  assert.equal(url.origin, "https://commons.wikimedia.org");
  assert.ok(
    url.pathname.startsWith("/wiki/File:") &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password,
  );
  assert.ok(plain(r.changes, 600));
  assert.ok(
    !prior().fixtures.some((x) => x.sha256 === r.sha256 || x.sourceSha1 === r.sourceSha1),
    "prior_bytes_or_source",
  );
}
export function coverage(rows) {
  return Object.fromEntries(
    [...kinds, "unknown"].map((kind) => [kind, rows.filter((r) => r.expectedKind === kind).length]),
  );
}
export function validateManifest(m) {
  assert.equal(m.schemaVersion, "spatial-data-manifest-v1");
  assert.equal(m.labelReviewStatus, "ai_reviewed_human_review_required");
  assert.equal(m.visualReviewStatus, "ai_visual_review_human_review_required");
  assert.equal(m.pretrainingMembership, "unknown");
  assert.equal(m.trainingExecuted, false);
  assert.equal(m.inferenceExecuted, false);
  assert.ok(Array.isArray(m.fixtures) && m.fixtures.length === 20, "expected_20_eligible");
  unique(m.fixtures);
  const review = local("./spatial-data-review.json");
  assert.equal(m.reviewSha256, hash(review.bytes), "review_drift");
  assert.equal(
    m.priorManifestSha256,
    hash(local("./spatial-data-prior.json").bytes),
    "prior_drift",
  );
  const hashes = new Set(),
    sources = new Set();
  for (const r of m.fixtures) {
    fixture(r);
    const note = review.value.cases.find((x) => x.id === r.id);
    assert.equal(note?.eligible, true, "not_reviewed");
    assert.equal(r.reviewNote, note.reason, "review_changed");
    assert.equal(r.sourceFamily, note.sourceFamily ?? r.group);
    assert.equal(r.privacyReview, "no_identifiable_person_or_private_text_observed");
    assert.ok(plain(r.reviewNote, 1200));
    assert.ok(!hashes.has(r.sha256) && !sources.has(r.sourceSha1), "duplicate_fixture");
    hashes.add(r.sha256);
    sources.add(r.sourceSha1);
  }
  assert.deepEqual(m.coverage, coverage(m.fixtures));
  for (const kind of kinds) assert.equal(m.coverage[kind], 2, "positive_coverage");
  assert.equal(m.coverage.unknown, 10, "control_coverage");
  assert.ok(
    m.fixtures.filter((r) => r.challenge === "mixed").length >= 5,
    "five_mixed_controls_required",
  );
  assert.equal(m.acquisitionBudget.maximumNewImages, 40);
  assert.equal(m.acquisitionBudget.maximumNewBytes, 25_000_000);
  assert.ok(
    Number.isInteger(m.acquisitionBudget.newImagesDownloaded) &&
      m.acquisitionBudget.newImagesDownloaded >= 20 &&
      m.acquisitionBudget.newImagesDownloaded <= 40,
  );
  assert.ok(
    Number.isInteger(m.acquisitionBudget.newBytesDownloaded) &&
      m.acquisitionBudget.newBytesDownloaded <= 25_000_000 &&
      m.acquisitionBudget.newBytesDownloaded >= m.fixtures.reduce((n, r) => n + r.bytes, 0),
  );
  assert.ok(Number.isFinite(Date.parse(m.frozenAt)));
  assert.match(m.candidateManifestSha256, /^[a-f0-9]{64}$/u);
  return m;
}
export function validateLocal(m, directory) {
  validateManifest(m);
  const root = fs.realpathSync(directory);
  assert.equal(root, path.resolve(directory));
  for (const r of m.fixtures) {
    const file = path.join(root, `${r.id}.jpg`),
      stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    assert.equal(fs.realpathSync(file), file);
    assert.equal(stat.size, r.bytes);
    const bytes = fs.readFileSync(file, {
      flag: fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    });
    assert.equal(hash(bytes), r.sha256);
    assert.ok(bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217);
  }
  return m;
}
function outputPath(input, cwd) {
  assert.ok(plain(input, 1024) && !/^[a-z]+:/iu.test(input));
  const work = fs.realpathSync(path.join(cwd, "work")),
    output = path.resolve(cwd, input),
    parent = fs.realpathSync(path.dirname(output));
  assert.ok(parent === work || parent.startsWith(`${work}${path.sep}`));
  assert.ok(!fs.existsSync(output), "output_exists");
  return output;
}
export async function acquire(input, cwd = process.cwd()) {
  const specFile = local("./spatial-data-cases.json"),
    spec = validateSpecification(specFile.value);
  const output = outputPath(input, cwd);
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
    headers: {
      "User-Agent":
        "KierratysAppi-spatial-QA/0.1 (https://github.com/roopeaal/KierratysAppi; bounded public diagnostic)",
    },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  assert.ok(res.ok);
  const parts = [];
  let count = 0;
  for await (const p of res.body) {
    count += p.length;
    assert.ok(count <= 2_000_000);
    parts.push(p);
  }
  const raw = Buffer.concat(parts),
    pages = new Map(Object.values(JSON.parse(raw).query?.pages ?? {}).map((r) => [r.title, r]));
  const records = spec.cases.map((r) => {
    const image = pages.get(r.title)?.imageinfo?.[0],
      meta = image?.extmetadata;
    assert.ok(image, "source_missing");
    assert.equal(
      meta.LicenseShortName.value,
      r.license === "CC0-1.0" ? "CC0" : r.license.replace("CC-BY-", "CC BY "),
      "licence_changed",
    );
    const download = new URL(image.thumburl ?? image.url);
    download.search = "";
    return {
      ...r,
      author: clean(meta.Artist?.value, 700),
      credit: clean(
        [meta.Credit?.value, meta.Attribution?.value].filter(Boolean).join(" | ") ||
          meta.Artist?.value,
        2500,
      ),
      licenseUrl: licences[r.license],
      pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(r.title.replaceAll(" ", "_")).replace("File%3A", "File:")}`,
      downloadUrl: checkedImageUrl(download.href).href,
      sourceSha1: image.sha1,
      sourceTimestamp: image.timestamp,
      sourceDescription: clean(meta.ImageDescription?.value, 1000),
      seenDiagnostic: false,
      changes:
        "Commons thumbnail resize only. No crop, retouch or label/prediction-based image selection. Composition, safety and sorting truth are not verified.",
    };
  });
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, "metadata.json"), raw, { flag: "wx" });
  fs.writeFileSync(
    path.join(output, "started.json"),
    JSON.stringify(
      {
        startedAt: new Date().toISOString(),
        specificationSha256: hash(specFile.bytes),
        plannedImages: records.length,
        maximumImages: 40,
        maximumBytes: 25_000_000,
        inferenceCalls: 0,
        trainingCalls: 0,
        retries: 0,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const fixtures = [];
  let bytesTotal = 0;
  for (const r of records) {
    assert.ok(!prior().fixtures.some((x) => x.sourceSha1 === r.sourceSha1), "prior_source");
    const bytes = await fetchImage(r.downloadUrl);
    bytesTotal += bytes.length;
    assert.ok(bytesTotal <= 25_000_000, "byte_budget");
    const row = { ...r, bytes: bytes.length, sha256: hash(bytes) };
    fixture(row);
    assert.ok(!fixtures.some((x) => x.sha256 === row.sha256 || x.sourceSha1 === row.sourceSha1));
    fs.writeFileSync(path.join(output, `${r.id}.jpg`), bytes, { flag: "wx" });
    fixtures.push(row);
    console.log(JSON.stringify({ downloaded: r.id, bytes: bytes.length, total: bytesTotal }));
  }
  const manifest = {
    schemaVersion: "spatial-data-candidates-v1",
    specificationSha256: hash(specFile.bytes),
    metadataSha256: hash(raw),
    preparedAt: new Date().toISOString(),
    trainingExecuted: false,
    inferenceExecuted: false,
    fixtures,
  };
  fs.writeFileSync(path.join(output, "fixtures.json"), JSON.stringify(manifest, null, 2) + "\n", {
    flag: "wx",
  });
  return { directory: output, images: fixtures.length, bytes: bytesTotal, inferenceCalls: 0 };
}
export function freeze(candidatePath, reviewPath, input, cwd = process.cwd()) {
  const candidates = readCorpusJson(path.resolve(cwd, candidatePath), 1_000_000),
    reviewed = readCorpusJson(path.resolve(cwd, reviewPath), 1_000_000),
    review = reviewed.value;
  assert.equal(candidates.value.schemaVersion, "spatial-data-candidates-v1");
  assert.equal(review.schemaVersion, "spatial-data-review-v1");
  assert.equal(review.reviewStatus, "ai_visual_review_human_review_required");
  assert.equal(review.reviewedBeforeInference, true);
  assert.equal(review.cases.length, candidates.value.fixtures.length);
  assert.equal(new Set(review.cases.map((r) => r.id)).size, review.cases.length);
  const fixtures = [];
  for (const r of candidates.value.fixtures) {
    fixture(r);
    const note = review.cases.find((x) => x.id === r.id);
    assert.ok(note && typeof note.eligible === "boolean" && plain(note.reason, 1200));
    if (!note.eligible) continue;
    assert.equal(note.privacyReview, "no_identifiable_person_or_private_text_observed");
    fixtures.push({
      ...r,
      sourceFamily: note.sourceFamily ?? r.group,
      reviewNote: note.reason,
      privacyReview: note.privacyReview,
    });
  }
  const manifest = {
    schemaVersion: "spatial-data-manifest-v1",
    purpose:
      "Prospective confirmatory visible-form/mixed-scene engineering diagnostic, never material, identity, hazard or sorting truth.",
    labelReviewStatus: "ai_reviewed_human_review_required",
    visualReviewStatus: "ai_visual_review_human_review_required",
    pretrainingMembership: "unknown",
    trainingExecuted: false,
    inferenceExecuted: false,
    frozenAt: new Date().toISOString(),
    candidateManifestSha256: hash(candidates.bytes),
    reviewSha256: hash(reviewed.bytes),
    priorManifestSha256: hash(local("./spatial-data-prior.json").bytes),
    acquisitionBudget: {
      newImagesDownloaded: candidates.value.fixtures.length,
      newBytesDownloaded: candidates.value.fixtures.reduce((n, r) => n + r.bytes, 0),
      maximumNewImages: 40,
      maximumNewBytes: 25_000_000,
    },
    coverage: coverage(fixtures),
    limitations: review.limitations,
    excluded: review.cases.filter((x) => !x.eligible),
    fixtures,
  };
  validateManifest(manifest);
  const output = outputPath(input, cwd);
  fs.mkdirSync(output);
  for (const r of fixtures) {
    const file = path.join(path.dirname(path.resolve(cwd, candidatePath)), `${r.id}.jpg`),
      stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    assert.equal(fs.realpathSync(file), file);
    const bytes = fs.readFileSync(file, {
      flag: fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    });
    assert.equal(bytes.length, r.bytes);
    assert.equal(hash(bytes), r.sha256);
    fs.writeFileSync(path.join(output, `${r.id}.jpg`), bytes, { flag: "wx" });
  }
  validateLocal(manifest, output);
  fs.writeFileSync(path.join(output, "fixtures.json"), JSON.stringify(manifest, null, 2) + "\n", {
    flag: "wx",
  });
  fs.writeFileSync(path.join(output, "review.json"), reviewed.bytes, { flag: "wx" });
  return {
    directory: output,
    manifestSha256: hash(fs.readFileSync(path.join(output, "fixtures.json"))),
    images: fixtures.length,
    coverage: manifest.coverage,
    inferenceCalls: 0,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === "--acquire" && process.argv.length === 4)
      console.log(JSON.stringify(await acquire(process.argv[3])));
    else if (process.argv[2] === "--freeze" && process.argv.length === 6)
      console.log(JSON.stringify(freeze(process.argv[3], process.argv[4], process.argv[5])));
    else throw Error("explicit_acquire_or_freeze_required");
  } catch (e) {
    console.error(e instanceof Error ? e.message : "spatial_data_failed");
    process.exitCode = 1;
  }
}
