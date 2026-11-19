// Bounded, explicit packaging seed acquisition; no model/training/inference.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkedImageUrl, fetchImage, readCorpusJson } from "./independent-corpus.mjs";

const licences = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC-BY-3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
};
function stripHtmlTagsRepeatedly(value) {
  let current = value;
  let previous;
  do {
    previous = current;
    current = current.replace(/<[^>]*>/gu, "");
  } while (current !== previous);
  return current;
}
const kinds = ["bottle", "jar", "box", "bag", "cup"];
const splits = ["train", "validation", "heldout"];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const plain = (value, max) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  !/[\p{Cc}\p{Cf}]/u.test(value);
const userAgent =
  "KierratysAppi-packaging-seed/0.1 (https://github.com/roopeaal/KierratysAppi; bounded local QA)";
const previousDevelopmentHashes = [
  "56d48570eeac647c4eef1bf4497c926df7e9984a729b58ae01f7ed04cc47f28e",
  "ac29a4e84a2373f638e5dc623d4d24fe2dc717a68aae4b53e8cba5c6a0d029b0",
  "92f7102fceecbe14b840e1cd4e70fcad7cc48107346aad2180383980552873ff",
  "27bc772faef3a1b1ae6341393ccdea2c459abd94b76d428cbf4687f8888991ce",
  "129ccffa2f027f447f7a1ce6dcbc19a88c1606a427aa59cd271de0ada519f929",
  "6f29967b2a243aebc5134705edaddea3cd6ddb41df344e3987fdd69da58a3293",
  "77e955757628796367c6fb30e878c484154a352005a4c5952765aabac4cb482b",
  "88cb731a5f974c3685d3bb401ed330088bf10d6a5209e305f494414182faf867",
];

export function validateCase(record) {
  assert.ok(record && typeof record === "object");
  assert.ok(plain(record.id, 64) && /^[a-z][a-z0-9-]+$/u.test(record.id), "invalid_id");
  assert.ok(
    plain(record.title, 512) && /^File:[^|/\\]+\.jpe?g$/iu.test(record.title),
    "invalid_title",
  );
  assert.ok(
    kinds.includes(record.expectedKind) || record.expectedKind === "unknown",
    "unsupported_kind",
  );
  assert.ok(splits.includes(record.split), "unsupported_split");
  assert.ok(plain(record.group, 120), "missing_group");
  assert.ok(plain(record.labelEvidence, 500), "missing_label_evidence");
  assert.ok(Object.hasOwn(licences, record.license), "unsupported_licence");
  if (record.seenDiagnostic === true)
    assert.equal(record.split, "train", "seen_data_cannot_be_held_out");
  return record;
}

function uniqueCases(records) {
  const ids = new Set(),
    titles = new Set(),
    groups = new Map();
  for (const record of records) {
    validateCase(record);
    assert.ok(!ids.has(record.id), "duplicate_id");
    ids.add(record.id);
    assert.ok(!titles.has(record.title), "duplicate_source");
    titles.add(record.title);
    const group = groups.get(record.group);
    if (group)
      assert.equal(group, `${record.split}:${record.expectedKind}`, "group_split_or_label_leakage");
    groups.set(record.group, `${record.split}:${record.expectedKind}`);
  }
}

export function validateSpecification(input) {
  assert.equal(input?.schemaVersion, "packaging-case-spec-v1");
  assert.equal(input.labelReviewStatus, "ai_reviewed_human_review_required");
  assert.equal(input.pretrainingMembership, "unknown");
  assert.equal(input.maximumNewImages, 40);
  assert.equal(input.maximumNewBytes, 25_000_000);
  assert.ok(Array.isArray(input.cases) && input.cases.length > 0 && input.cases.length <= 40);
  uniqueCases(input.cases);
  assert.ok(
    Array.isArray(input.reuseTrainOnly) &&
      new Set(input.reuseTrainOnly).size === input.reuseTrainOnly.length,
  );
  assert.ok(input.reuseTrainOnly.length <= 5);
  return input;
}

export function coverage(fixtures) {
  return Object.fromEntries(
    kinds.map((kind) => [
      kind,
      Object.fromEntries(
        splits.map((split) => [
          split,
          new Set(
            fixtures
              .filter((r) => r.expectedKind === kind && r.split === split)
              .map((r) => r.group),
          ).size,
        ]),
      ),
    ]),
  );
}

export function validateManifest(input) {
  assert.equal(input?.schemaVersion, "packaging-seed-v1");
  assert.equal(input.labelReviewStatus, "ai_reviewed_human_review_required");
  assert.equal(input.trainingExecuted, false);
  assert.equal(input.inferenceExecuted, false);
  assert.equal(input.pretrainingMembership, "unknown");
  assert.ok(
    Array.isArray(input.fixtures) && input.fixtures.length > 0 && input.fixtures.length <= 45,
  );
  uniqueCases(input.fixtures);
  const hashes = new Set();
  const seen = readCorpusJson(
    fileURLToPath(new URL("./independent-manifest.json", import.meta.url)),
    262_144,
  ).value.fixtures;
  const seenHashes = new Set([...previousDevelopmentHashes, ...seen.map((r) => r.sha256)]);
  const seenTitles = new Set(seen.map((r) => r.title));
  for (const r of input.fixtures) {
    assert.match(r.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(!hashes.has(r.sha256), "duplicate_bytes");
    hashes.add(r.sha256);
    assert.ok(Number.isInteger(r.bytes) && r.bytes >= 12 && r.bytes <= 1_500_000);
    assert.ok(plain(r.author, 350), "missing_credit");
    assert.equal(r.licenseUrl, licences[r.license]);
    checkedImageUrl(r.downloadUrl);
    const page = new URL(r.pageUrl);
    assert.equal(page.origin, "https://commons.wikimedia.org");
    assert.ok(
      page.pathname.startsWith("/wiki/File:") &&
        !page.search &&
        !page.hash &&
        !page.username &&
        !page.password,
    );
    assert.equal(
      decodeURIComponent(page.pathname.slice(6)).replaceAll("_", " "),
      r.title.replaceAll("_", " "),
      "wrong_source_page",
    );
    assert.match(r.sourceSha1, /^[a-f0-9]{40}$/u);
    assert.ok(Number.isFinite(Date.parse(r.sourceTimestamp)), "invalid_source_timestamp");
    assert.equal(typeof r.seenDiagnostic, "boolean");
    if (seenHashes.has(r.sha256) || seenTitles.has(r.title)) {
      assert.equal(r.seenDiagnostic, true, "historical_source_not_marked_seen");
      assert.equal(r.split, "train", "historical_source_outside_train");
    }
  }
  const fresh = input.fixtures.filter((r) => !r.seenDiagnostic);
  assert.ok(
    fresh.length <= 40 && fresh.reduce((n, r) => n + r.bytes, 0) <= 25_000_000,
    "download_budget_exceeded",
  );
  if (input.acquisitionBudget) {
    assert.equal(input.acquisitionBudget.maximumNewImages, 40);
    assert.equal(input.acquisitionBudget.maximumNewBytes, 25_000_000);
    assert.ok(
      Number.isInteger(input.acquisitionBudget.newImagesDownloaded) &&
        input.acquisitionBudget.newImagesDownloaded >= fresh.length &&
        input.acquisitionBudget.newImagesDownloaded <= 40,
      "total_image_budget_exceeded",
    );
    assert.ok(
      Number.isInteger(input.acquisitionBudget.newBytesDownloaded) &&
        input.acquisitionBudget.newBytesDownloaded >= fresh.reduce((n, r) => n + r.bytes, 0) &&
        input.acquisitionBudget.newBytesDownloaded <= 25_000_000,
      "total_byte_budget_exceeded",
    );
  }
  return input;
}

export function validateReview(review, candidates) {
  assert.equal(review?.schemaVersion, "packaging-review-v1");
  assert.equal(review.reviewStatus, "ai_visual_review_human_review_required");
  assert.equal(review.reviewedBeforeInference, true);
  assert.ok(Array.isArray(review.eligibleIds) && review.eligibleIds.length > 0);
  assert.ok(Array.isArray(review.excluded) && Array.isArray(review.splitOverrides));
  assert.ok(
    review.caseNotes && typeof review.caseNotes === "object" && !Array.isArray(review.caseNotes),
  );
  const all = [...review.eligibleIds, ...review.excluded.map((r) => r.id)];
  assert.equal(new Set(all).size, all.length, "duplicate_review_case");
  assert.equal(all.length, candidates.length, "incomplete_review");
  const ids = new Set(candidates.map((r) => r.id));
  for (const id of all) assert.ok(ids.has(id), "unknown_review_case");
  for (const r of review.excluded) assert.ok(plain(r.reason, 500), "missing_exclusion_reason");
  const overrides = new Set();
  for (const r of review.splitOverrides) {
    assert.ok(!overrides.has(r.id), "duplicate_split_override");
    overrides.add(r.id);
    assert.ok(review.eligibleIds.includes(r.id), "override_ineligible_case");
    const original = candidates.find((c) => c.id === r.id);
    assert.equal(original.split, r.from, "wrong_original_split");
    assert.ok(splits.includes(r.to) && plain(r.reason, 500));
    if (original.seenDiagnostic) assert.equal(r.to, "train", "seen_override_outside_train");
  }
  assert.ok(plain(review.limitations, 1000));
  return review;
}

export function validateLocal(directory, manifest) {
  validateManifest(manifest);
  for (const r of manifest.fixtures) {
    const file = path.join(directory, `${r.id}.jpg`),
      stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), "linked_or_nonfile_image");
    assert.equal(stat.size, r.bytes, "image_size_changed");
    assert.equal(sha(fs.readFileSync(file)), r.sha256, "image_hash_changed");
  }
  return manifest;
}

export function freezeReviewed(initialInput, supplementInput, outputInput, cwd = process.cwd()) {
  const work = fs.realpathSync(path.join(cwd, "work"));
  const inputs = [initialInput, supplementInput].map((input) => {
    const directory = fs.realpathSync(path.resolve(cwd, input));
    assert.ok(directory.startsWith(`${work}${path.sep}`), "input_outside_work");
    assert.ok(fs.lstatSync(directory).isDirectory());
    const record = readCorpusJson(path.join(directory, "fixtures.json"), 262_144);
    validateLocal(directory, record.value);
    return { directory, ...record };
  });
  const candidates = inputs.flatMap(({ directory, value }) =>
    value.fixtures.map((r) => ({ ...r, sourceDirectory: directory })),
  );
  const allNew = candidates.filter((r) => !r.seenDiagnostic),
    newBytes = allNew.reduce((n, r) => n + r.bytes, 0);
  assert.ok(allNew.length <= 40 && newBytes <= 25_000_000, "total_download_budget_exceeded");
  const reviewInput = readCorpusJson(
    fileURLToPath(new URL("./packaging-review.json", import.meta.url)),
    262_144,
  );
  const review = validateReview(reviewInput.value, candidates),
    eligible = new Set(review.eligibleIds);
  const fixtures = candidates
    .filter((r) => eligible.has(r.id))
    .map(({ sourceDirectory: _, ...r }) => ({
      ...r,
      split: review.splitOverrides.find((o) => o.id === r.id)?.to ?? r.split,
      visualReviewStatus: "ai_reviewed_human_review_required",
      ...(review.caseNotes[r.id] ? { reviewNote: review.caseNotes[r.id] } : {}),
    }));
  const manifest = {
    schemaVersion: "packaging-seed-v1",
    purpose:
      "Contemporary visible container/packaging kinds; no material, safety, identity or sorting truth.",
    labelReviewStatus: "ai_reviewed_human_review_required",
    pretrainingMembership: "unknown",
    trainingExecuted: false,
    inferenceExecuted: false,
    frozenAt: new Date().toISOString(),
    candidateManifestSha256: inputs.map((v) => sha(v.bytes)),
    reviewSha256: sha(reviewInput.bytes),
    acquisitionBudget: {
      newImagesDownloaded: allNew.length,
      newBytesDownloaded: newBytes,
      maximumNewImages: 40,
      maximumNewBytes: 25_000_000,
    },
    coverage: coverage(fixtures),
    limitations: review.limitations,
    excluded: review.excluded,
    fixtures,
  };
  validateManifest(manifest);
  const output = outputDirectory(cwd, outputInput);
  fs.mkdirSync(output);
  for (const r of fixtures) {
    const source = candidates.find((c) => c.id === r.id);
    fs.copyFileSync(
      path.join(source.sourceDirectory, `${r.id}.jpg`),
      path.join(output, `${r.id}.jpg`),
      fs.constants.COPYFILE_EXCL,
    );
  }
  validateLocal(output, manifest);
  fs.writeFileSync(path.join(output, "fixtures.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
  });
  fs.writeFileSync(path.join(output, "review.json"), reviewInput.bytes, { flag: "wx" });
  return {
    directory: output,
    manifestSha256: sha(fs.readFileSync(path.join(output, "fixtures.json"))),
    images: fixtures.length,
    coverage: manifest.coverage,
    newImagesDownloaded: allNew.length,
    newBytesDownloaded: newBytes,
    inferenceCalls: 0,
  };
}

function outputDirectory(cwd, input) {
  assert.ok(plain(input, 1024) && !/^[a-z]+:/iu.test(input), "invalid_local_path");
  const root = fs.realpathSync(path.join(cwd, "work")),
    out = path.resolve(cwd, input),
    parent = fs.realpathSync(path.dirname(out));
  assert.ok(parent === root || parent.startsWith(`${root}${path.sep}`), "outside_work");
  assert.equal(fs.existsSync(out), false, "output_exists");
  return out;
}

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
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  assert.ok(response.ok, `metadata_http_${response.status}`);
  const parts = [];
  let total = 0;
  for await (const part of response.body) {
    total += part.length;
    assert.ok(total <= 524_288, "metadata_too_large");
    parts.push(part);
  }
  const bytes = Buffer.concat(parts),
    data = JSON.parse(bytes);
  const pages = new Map(Object.values(data.query?.pages ?? {}).map((p) => [p.title, p]));
  return {
    bytes,
    records: spec.cases.map((r) => {
      const i = pages.get(r.title)?.imageinfo?.[0];
      assert.ok(i, "source_missing");
      assert.equal(
        i.extmetadata?.LicenseShortName?.value,
        r.license === "CC0-1.0" ? "CC0" : r.license.replace("CC-BY-", "CC BY "),
        "licence_changed",
      );
      const image = new URL(i.thumburl ?? i.url);
      image.search = "";
      return {
        ...r,
        downloadUrl: checkedImageUrl(image.href).href,
        pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(r.title.replaceAll(" ", "_")).replace("File%3A", "File:")}`,
        author: stripHtmlTagsRepeatedly(i.extmetadata?.Artist?.value ?? "")
          .replaceAll("&amp;", "&")
          .trim(),
        licenseUrl: licences[r.license],
        sourceSha1: i.sha1,
        sourceTimestamp: i.timestamp,
        seenDiagnostic: false,
        changes:
          "Commons thumbnail resize only; no crop or retouch. AI visual label, not verified material/safety.",
      };
    }),
  };
}

export async function acquire(outputInput, seenInput, cwd = process.cwd(), batch = "initial") {
  assert.ok(batch === "initial" || batch === "supplement", "unknown_batch");
  const specification = readCorpusJson(
    fileURLToPath(
      new URL(
        batch === "initial" ? "./packaging-cases.json" : "./packaging-supplement-cases.json",
        import.meta.url,
      ),
    ),
    262_144,
  );
  const spec = validateSpecification(specification.value),
    out = outputDirectory(cwd, outputInput);
  const seenDir = fs.realpathSync(path.resolve(cwd, seenInput)),
    work = fs.realpathSync(path.join(cwd, "work"));
  assert.ok(seenDir.startsWith(`${work}${path.sep}`), "seen_outside_work");
  const seen = readCorpusJson(path.join(seenDir, "fixtures.json"), 262_144).value;
  const reuse = spec.reuseTrainOnly.map((id) => {
    const r = seen.fixtures.find((r) => r.id === id);
    assert.ok(r, "seen_case_missing");
    return {
      ...r,
      id: `seen-${id}`,
      split: "train",
      seenDiagnostic: true,
      labelEvidence: `Previously evaluated modern-container reference, TRAIN only. ${r.labelEvidence}`,
    };
  });
  const prepared = await metadata(spec);
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, "metadata.json"), prepared.bytes, { flag: "wx" });
  fs.writeFileSync(
    path.join(out, "started.json"),
    JSON.stringify(
      {
        startedAt: new Date().toISOString(),
        specificationSha256: sha(specification.bytes),
        plannedNewImages: prepared.records.length,
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
  let newBytes = 0;
  for (const r of prepared.records) {
    const bytes = await fetchImage(r.downloadUrl);
    newBytes += bytes.length;
    assert.ok(newBytes <= 25_000_000, "download_budget_exceeded");
    fs.writeFileSync(path.join(out, `${r.id}.jpg`), bytes, { flag: "wx" });
    fixtures.push({ ...r, bytes: bytes.length, sha256: sha(bytes) });
  }
  for (const r of reuse) {
    const file = path.join(seenDir, `${r.id.slice(5)}.jpg`),
      stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.length, r.bytes);
    assert.equal(sha(bytes), r.sha256);
    fs.writeFileSync(path.join(out, `${r.id}.jpg`), bytes, { flag: "wx" });
    fixtures.push(r);
  }
  const manifest = {
    schemaVersion: "packaging-seed-v1",
    purpose: spec.purpose,
    labelReviewStatus: spec.labelReviewStatus,
    pretrainingMembership: "unknown",
    trainingExecuted: false,
    inferenceExecuted: false,
    frozenAt: new Date().toISOString(),
    specificationSha256: sha(specification.bytes),
    visualReviewStatus: "candidate_unreviewed",
    fixtures,
  };
  validateManifest(manifest);
  fs.writeFileSync(path.join(out, "fixtures.json"), JSON.stringify(manifest, null, 2), {
    flag: "wx",
  });
  return {
    directory: out,
    images: fixtures.length,
    newImages: prepared.records.length,
    newBytes,
    manifestSha256: sha(fs.readFileSync(path.join(out, "fixtures.json"))),
    coverage: coverage(fixtures),
    inferenceCalls: 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === "--review") {
      assert.equal(process.argv.length, 6, "explicit_paths_required");
      console.log(
        JSON.stringify(freezeReviewed(process.argv[3], process.argv[4], process.argv[5]), null, 2),
      );
    } else {
      assert.ok(
        ["--acquire", "--acquire-supplement"].includes(process.argv[2]),
        "explicit_acquire_required",
      );
      assert.equal(process.argv.length, 5, "explicit_paths_required");
      console.log(
        JSON.stringify(
          await acquire(
            process.argv[3],
            process.argv[4],
            process.cwd(),
            process.argv[2] === "--acquire" ? "initial" : "supplement",
          ),
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "packaging_corpus_failed");
    process.exitCode = 1;
  }
}
