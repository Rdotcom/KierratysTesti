// Explicit, bounded public-image diagnostics. No inference, API credential or training.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kinds = new Set(["bottle", "jar", "box", "bag", "cup", "unknown"]);
const licences = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
};
const maximumBytes = 1_500_000;
const historicalDevelopmentHashes = [
  "56d48570eeac647c4eef1bf4497c926df7e9984a729b58ae01f7ed04cc47f28e",
  "ac29a4e84a2373f638e5dc623d4d24fe2dc717a68aae4b53e8cba5c6a0d029b0",
  "92f7102fceecbe14b840e1cd4e70fcad7cc48107346aad2180383980552873ff",
  "27bc772faef3a1b1ae6341393ccdea2c459abd94b76d428cbf4687f8888991ce",
  "129ccffa2f027f447f7a1ce6dcbc19a88c1606a427aa59cd271de0ada519f929",
  "6f29967b2a243aebc5134705edaddea3cd6ddb41df344e3987fdd69da58a3293",
  "77e955757628796367c6fb30e878c484154a352005a4c5952765aabac4cb482b",
  "88cb731a5f974c3685d3bb401ed330088bf10d6a5209e305f494414182faf867",
];
const userAgent = "KierratysAppi-local-QA/0.1 (bounded public rights inspection; no bulk)";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const idPattern = /^[a-z][a-z0-9-]{1,63}$/u;
const text = (value, limit) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= limit &&
  !/[\p{Cc}\p{Cf}]/u.test(value);

export function readCorpusJson(file, maxBytes = 65_536) {
  const info = fs.lstatSync(file);
  assert.ok(info.isFile() && !info.isSymbolicLink(), "linked_or_nonfile_manifest");
  assert.ok(info.size <= maxBytes, "manifest_too_large");
  assert.equal(fs.realpathSync(file), path.resolve(file), "linked_manifest_path");
  const bytes = fs.readFileSync(file, {
    flag: fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  });
  assert.ok(bytes.length <= maxBytes, "manifest_too_large");
  try {
    return { bytes, value: JSON.parse(bytes) };
  } catch {
    throw new Error("invalid_manifest_json");
  }
}

export function validateSpecification(input) {
  assert.ok(input && typeof input === "object", "invalid_specification");
  assert.equal(input.schemaVersion, "independent-case-spec-v1");
  assert.equal(input.trainingIncluded, false);
  assert.equal(input.pretrainingMembership, "unknown");
  assert.equal(input.labelReviewStatus, "ai_reviewed_human_review_required");
  assert.ok(text(input.purpose, 256));
  assert.ok(Array.isArray(input.cases) && input.cases.length > 0 && input.cases.length <= 12);
  const ids = new Set();
  const groups = new Map();
  const titles = new Set();
  for (const record of input.cases) {
    assert.ok(text(record.id, 64) && idPattern.test(record.id), "invalid_id");
    assert.ok(!ids.has(record.id), "duplicate_id");
    ids.add(record.id);
    assert.ok(text(record.group, 100), "invalid_group");
    assert.ok(record.split === "validation" || record.split === "heldout", "invalid_split");
    const oldSplit = groups.get(record.group);
    assert.ok(!oldSplit || oldSplit === record.split, "group_split_leakage");
    groups.set(record.group, record.split);
    assert.ok(
      text(record.title, 240) && /^File:[^|/\\]+\.jpe?g$/iu.test(record.title),
      "invalid_title",
    );
    assert.ok(!titles.has(record.title), "duplicate_source");
    titles.add(record.title);
    assert.ok(kinds.has(record.expectedKind), "unsupported_kind");
    assert.ok(Object.hasOwn(licences, record.license), "unsupported_licence");
    assert.ok(text(record.labelEvidence, 400), "missing_label_evidence");
    if (record.creditOverride !== undefined) assert.ok(text(record.creditOverride, 200));
  }
  return input;
}

export function checkedImageUrl(input) {
  assert.ok(text(input, 2048), "invalid_image_url");
  const url = new URL(input);
  assert.equal(url.protocol, "https:", "invalid_image_protocol");
  assert.ok(
    !url.username && !url.password && !url.port && !url.hash && !url.search,
    "image_url_credentials_or_query",
  );
  assert.ok(
    ["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname),
    "invalid_image_host",
  );
  assert.ok(
    url.pathname.startsWith("/wikipedia/commons/") && /\.jpe?g$/iu.test(url.pathname),
    "invalid_image_path",
  );
  assert.ok(!/%(?:00|2f|5c|2e)/iu.test(url.pathname), "encoded_path_separator");
  return url;
}

function validateProvenance(record) {
  assert.ok(text(record.author, 250), "missing_author_credit");
  const page = new URL(record.pageUrl);
  assert.equal(page.origin, "https://commons.wikimedia.org");
  assert.ok(
    page.pathname.startsWith("/wiki/File:") &&
      !page.search &&
      !page.hash &&
      !page.username &&
      !page.password &&
      !page.port,
  );
  assert.equal(
    decodeURIComponent(page.pathname.slice(6)).replaceAll("_", " "),
    record.title.replaceAll("_", " "),
    "wrong_source_page",
  );
  checkedImageUrl(record.downloadUrl);
  assert.equal(record.licenseUrl, licences[record.license]);
  assert.match(record.sourceSha1, /^[a-f0-9]{40}$/u);
  assert.ok(Number.isFinite(Date.parse(record.sourceTimestamp)));
  assert.ok(text(record.changes, 256));
  assert.equal(record.labelReviewStatus, "ai_reviewed_human_review_required");
}

export function validateFrozenManifest(input, historicalHashes = []) {
  assert.ok(input && typeof input === "object");
  assert.equal(input.schemaVersion, "independent-corpus-v1");
  assert.equal(input.trainingIncluded, false);
  assert.equal(input.pretrainingMembership, "unknown");
  assert.equal(input.labelReviewStatus, "ai_reviewed_human_review_required");
  assert.ok(Number.isFinite(Date.parse(input.frozenAt)));
  assert.match(input.specificationSha256, /^[a-f0-9]{64}$/u);
  assert.ok(
    Array.isArray(input.fixtures) && input.fixtures.length > 0 && input.fixtures.length <= 12,
  );
  validateSpecification({
    ...input,
    schemaVersion: "independent-case-spec-v1",
    cases: input.fixtures,
  });
  const hashes = new Set();
  const historic = new Set([...historicalDevelopmentHashes, ...historicalHashes]);
  for (const record of input.fixtures) {
    assert.match(record.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(!hashes.has(record.sha256), "duplicate_image_bytes");
    assert.ok(!historic.has(record.sha256), "historical_image_not_independent");
    hashes.add(record.sha256);
    assert.ok(Number.isInteger(record.bytes) && record.bytes >= 12 && record.bytes <= maximumBytes);
    validateProvenance(record);
  }
  return input;
}

async function boundedResponse(response, maxBytes) {
  assert.equal(response.ok, true, `http_${response.status}`);
  const length = response.headers.get("content-length");
  if (length !== null) assert.ok(Number(length) <= maxBytes, "response_too_large");
  assert.ok(response.body);
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) {
      await response.body.cancel().catch(() => {});
      throw new Error("response_too_large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

export async function fetchImage(urlInput, fetchImpl = fetch) {
  const url = checkedImageUrl(urlInput);
  const response = await fetchImpl(url, {
    headers: { "User-Agent": userAgent },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(
    response.headers.get("content-type")?.split(";")[0].toLowerCase(),
    "image/jpeg",
    "not_jpeg_response",
  );
  const bytes = await boundedResponse(response, maximumBytes);
  assert.ok(
    bytes.length >= 12 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes.at(-2) === 255 &&
      bytes.at(-1) === 217,
    "invalid_jpeg_envelope",
  );
  return bytes;
}

function workDirectory(cwd, input, mustExist) {
  const work = fs.realpathSync(path.join(cwd, "work"));
  const result = path.resolve(cwd, input);
  const parent = fs.realpathSync(path.dirname(result));
  assert.ok(parent === work || parent.startsWith(`${work}${path.sep}`), "outside_work");
  if (mustExist) {
    assert.ok(fs.lstatSync(result).isDirectory() && !fs.lstatSync(result).isSymbolicLink());
    assert.equal(fs.realpathSync(result), result, "linked_directory");
  } else assert.equal(fs.existsSync(result), false, "output_exists");
  return result;
}

export function validateLocalCorpus(directory, manifest, historicalHashes = []) {
  validateFrozenManifest(manifest, historicalHashes);
  for (const record of manifest.fixtures) {
    const file = path.join(directory, `${record.id}.jpg`);
    const info = fs.lstatSync(file);
    assert.ok(info.isFile() && !info.isSymbolicLink(), "linked_or_nonfile_image");
    assert.equal(info.size, record.bytes, "image_size_changed");
    assert.equal(digest(fs.readFileSync(file)), record.sha256, "image_hash_changed");
  }
  return manifest;
}

export function validateReview(review, candidate) {
  assert.equal(review.schemaVersion, "independent-visual-review-v1");
  assert.equal(review.reviewStatus, "ai_visual_review_human_review_required");
  assert.equal(review.reviewedBeforeInference, true);
  assert.ok(Array.isArray(review.eligibleIds) && review.eligibleIds.length > 0);
  assert.ok(Array.isArray(review.excluded));
  const candidates = new Set(candidate.fixtures.map((record) => record.id));
  const reviewed = [...review.eligibleIds, ...review.excluded.map((record) => record.id)];
  assert.equal(new Set(reviewed).size, reviewed.length, "duplicate_review_disposition");
  assert.equal(reviewed.length, candidates.size, "incomplete_review");
  for (const id of reviewed) assert.ok(candidates.has(id), "unknown_review_case");
  for (const record of review.excluded) assert.ok(text(record.reason, 400));
  assert.ok(text(review.limitations, 700));
  return review;
}

export function freezeReviewedSubset(inputDirectory, outputDirectory, cwd = process.cwd()) {
  const input = workDirectory(cwd, inputDirectory, true);
  const output = workDirectory(cwd, outputDirectory, false);
  const { bytes: candidateBytes, value: candidateValue } = readCorpusJson(
    path.join(input, "fixtures.json"),
  );
  const candidate = validateLocalCorpus(input, candidateValue);
  const reviewBytes = fs.readFileSync(new URL("./independent-review.json", import.meta.url));
  const review = validateReview(JSON.parse(reviewBytes), candidate);
  const eligible = new Set(review.eligibleIds);
  const manifest = {
    ...candidate,
    frozenAt: new Date().toISOString(),
    candidateManifestSha256: digest(candidateBytes),
    visualReviewSha256: digest(reviewBytes),
    fixtures: candidate.fixtures.filter((record) => eligible.has(record.id)),
  };
  validateFrozenManifest(manifest);
  fs.mkdirSync(output);
  for (const record of manifest.fixtures)
    fs.copyFileSync(
      path.join(input, `${record.id}.jpg`),
      path.join(output, `${record.id}.jpg`),
      fs.constants.COPYFILE_EXCL,
    );
  validateLocalCorpus(output, manifest);
  fs.writeFileSync(path.join(output, "fixtures.json"), JSON.stringify(manifest, null, 2), {
    flag: "wx",
  });
  fs.writeFileSync(path.join(output, "visual-review.json"), reviewBytes, { flag: "wx" });
  return {
    directory: output,
    images: manifest.fixtures.length,
    manifestSha256: digest(fs.readFileSync(path.join(output, "fixtures.json"))),
    inferenceCalls: 0,
  };
}

export async function downloadCorpus(outputInput, cwd = process.cwd()) {
  const specificationPath = fileURLToPath(new URL("./independent-cases.json", import.meta.url));
  const specificationBytes = fs.readFileSync(specificationPath);
  const specification = validateSpecification(JSON.parse(specificationBytes));
  const output = workDirectory(cwd, outputInput, false);
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    titles: specification.cases.map((record) => record.title).join("|"),
    prop: "imageinfo",
    iiprop: "url|size|extmetadata|sha1|timestamp",
    iiurlwidth: "768",
  });
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const metadataBytes = await boundedResponse(response, 262_144);
  const metadata = JSON.parse(metadataBytes);
  const pages = new Map(
    Object.values(metadata.query?.pages ?? {}).map((page) => [page.title, page]),
  );
  const prepared = specification.cases.map((record) => {
    const info = pages.get(record.title)?.imageinfo?.[0];
    assert.ok(info, "source_missing");
    assert.equal(
      info.extmetadata?.LicenseShortName?.value,
      record.license === "CC0-1.0" ? "CC0" : "CC BY 4.0",
      "licence_changed",
    );
    const imageUrl = new URL(info.thumburl ?? info.url);
    imageUrl.search = ""; // Remove Commons attribution-campaign query, never image content.
    const author =
      record.creditOverride ??
      info.extmetadata?.Artist?.value
        ?.replace(/&amp;/gu, "&")
        .replace(/&/gu, "&amp;")
        .replace(/</gu, "&lt;")
        .replace(/>/gu, "&gt;")
        .trim();
    const result = {
      ...record,
      pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(record.title.replaceAll(" ", "_")).replace("File%3A", "File:")}`,
      downloadUrl: checkedImageUrl(imageUrl.href).href,
      author,
      licenseUrl: licences[record.license],
      sourceSha1: info.sha1,
      sourceTimestamp: info.timestamp,
      changes:
        "Commons-provided thumbnail resize only; no crop, retouching or relabelling. Original used when no thumbnail is supplied.",
      labelReviewStatus: specification.labelReviewStatus,
    };
    validateProvenance(result);
    return result;
  });
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, "metadata.json"), metadataBytes, { flag: "wx" });
  fs.writeFileSync(
    path.join(output, "download-started.json"),
    JSON.stringify(
      {
        startedAt: new Date().toISOString(),
        specificationSha256: digest(specificationBytes),
        plannedImages: prepared.length,
        retries: 0,
        inferenceCalls: 0,
        paidCalls: 0,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  const fixtures = [];
  for (const record of prepared) {
    const bytes = await fetchImage(record.downloadUrl);
    fs.writeFileSync(path.join(output, `${record.id}.jpg`), bytes, { flag: "wx" });
    fixtures.push({ ...record, bytes: bytes.length, sha256: digest(bytes) });
  }
  const manifest = {
    ...specification,
    schemaVersion: "independent-corpus-v1",
    cases: undefined,
    specificationSha256: digest(specificationBytes),
    frozenAt: new Date().toISOString(),
    fixtures,
  };
  validateLocalCorpus(output, manifest);
  fs.writeFileSync(path.join(output, "fixtures.json"), JSON.stringify(manifest, null, 2), {
    flag: "wx",
  });
  return {
    directory: output,
    images: fixtures.length,
    bytes: fixtures.reduce((total, record) => total + record.bytes, 0),
    manifestSha256: digest(fs.readFileSync(path.join(output, "fixtures.json"))),
    inferenceCalls: 0,
  };
}

export function parseArguments(args) {
  if (args.length === 3 && args[0] === "--review") {
    assert.ok(
      args.slice(1).every((value) => text(value, 1024) && !/^[a-z]+:/iu.test(value)),
      "invalid_local_path",
    );
    return { action: "--review", directory: args[1], output: args[2] };
  }
  assert.ok(
    args.length === 2 && ["--download", "--validate"].includes(args[0]),
    "explicit_action_required",
  );
  assert.ok(text(args[1], 1024) && !/^[a-z]+:/iu.test(args[1]), "invalid_local_path");
  return { action: args[0], directory: args[1] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.action === "--review")
      console.log(JSON.stringify(freezeReviewedSubset(options.directory, options.output)));
    else if (options.action === "--download")
      console.log(JSON.stringify(await downloadCorpus(options.directory)));
    else {
      const directory = workDirectory(process.cwd(), options.directory, true);
      const file = path.join(directory, "fixtures.json");
      validateLocalCorpus(directory, readCorpusJson(file).value);
      console.log(
        "PASS: local independent-corpus bytes, licence metadata and group splits; no inference.",
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "corpus_failed");
    process.exitCode = 1;
  }
}
