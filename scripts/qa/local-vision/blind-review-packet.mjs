// Offline human-reference workflow. Never loads predictions or runs a model.
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkedImageUrl } from "./independent-corpus.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/u;
const idPattern = /^[a-z][a-z0-9-]{1,63}$/u;
const labelOptions = ["bottle", "jar", "box", "bag", "cup", "outside", "mixed", "unclear"];
const yesNo = ["yes", "no", "unclear"];
const text = (value, maximum) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximum &&
  !/[\p{Cc}\p{Cf}]/u.test(value);
const registry = {
  "robustness-manifest-v1": "./robustness-corpus.mjs",
  "spatial-data-manifest-v1": "./spatial-data-corpus.mjs",
  "foreground-data-manifest-v1": "./foreground-data-corpus.mjs",
};
const licenceUrls = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC-BY-3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
};

function workPath(input, cwd, directory = false) {
  assert.ok(text(input, 4096) && !/^[a-z]+:/iu.test(input), "invalid_local_path");
  const root = fs.realpathSync(path.join(cwd, "work")),
    file = path.resolve(cwd, input);
  assert.ok(file.startsWith(`${root}${path.sep}`), "outside_work");
  assert.equal(fs.realpathSync(file), file, "linked_path");
  const stat = fs.lstatSync(file);
  assert.ok(
    !stat.isSymbolicLink() && (directory ? stat.isDirectory() : stat.isFile()),
    "not_regular",
  );
  if (!directory) assert.equal(stat.nlink, 1, "hard_link");
  return file;
}
function boundedRead(file, maximum, rejectHardLinks = true) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    assert.ok(
      stat.isFile() &&
        stat.nlink >= 1 &&
        (!rejectHardLinks || stat.nlink === 1) &&
        stat.size > 0 &&
        stat.size <= maximum,
      "file_bound",
    );
    const output = Buffer.alloc(maximum + 1);
    let count = 0;
    while (true) {
      const read = fs.readSync(fd, output, count, output.length - count, null);
      if (read === 0) break;
      count += read;
      assert.ok(count <= maximum, "growing_file");
    }
    assert.equal(count, stat.size, "file_changed");
    const after = fs.fstatSync(fd);
    for (const key of ["dev", "ino", "nlink", "size", "mtimeMs", "ctimeMs"])
      assert.equal(after[key], stat[key], "file_changed");
    return output.subarray(0, count);
  } finally {
    fs.closeSync(fd);
  }
}

/** Only pinned installed package metadata may share a pnpm store inode, never review data. */
export function readBlindReviewSource(file, root = project) {
  const canonical = fs.realpathSync(file);
  assert.equal(canonical, path.resolve(file), "linked_source");
  const pinnedMetadata = path.join(
    fs.realpathSync(root),
    "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/package.json",
  );
  const installedMetadata = canonical === pinnedMetadata;
  const bytes = boundedRead(canonical, 1_000_000, !installedMetadata);
  if (installedMetadata) {
    const metadata = JSON.parse(bytes);
    assert.equal(metadata.name, "tsx", "runtime_package");
    assert.equal(metadata.version, "4.21.0", "runtime_version");
  }
  return bytes;
}
function readJson(file, maximum = 2_000_000) {
  const bytes = boundedRead(file, maximum);
  return { bytes, value: JSON.parse(bytes) };
}
function outputPath(input, cwd) {
  assert.ok(text(input, 4096) && !/^[a-z]+:/iu.test(input), "invalid_output");
  const root = fs.realpathSync(path.join(cwd, "work")),
    output = path.resolve(cwd, input);
  const parent = fs.realpathSync(path.dirname(output));
  assert.ok(parent === root || parent.startsWith(`${root}${path.sep}`), "outside_work");
  assert.equal(parent, path.dirname(output), "linked_output_parent");
  assert.equal(fs.lstatSync(output, { throwIfNoEntry: false }), undefined, "output_exists");
  return output;
}
export function csvCell(value) {
  let raw = String(value ?? "");
  if (/^\s*[=+@-]/u.test(raw)) raw = `'${raw}`;
  return `"${raw.replaceAll('"', '""')}"`;
}
const csv = (headers, rows) =>
  `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
const writeJson = (file, value) =>
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });

export async function loadFrozenCorpora(inputs, cwd = project) {
  assert.ok(Array.isArray(inputs) && inputs.length > 0 && inputs.length <= 3, "corpus_count");
  const seen = new Set(),
    result = [];
  for (const input of inputs) {
    assert.match(input.manifestSha256, hashPattern, "manifest_hash_required");
    const directory = workPath(input.directory, cwd, true);
    assert.ok(!seen.has(directory), "duplicate_corpus");
    seen.add(directory);
    const file = workPath(path.join(directory, "fixtures.json"), cwd);
    const manifest = readJson(file, 1_000_000);
    assert.equal(sha(manifest.bytes), input.manifestSha256, "manifest_drift");
    assert.ok(Object.hasOwn(registry, manifest.value.schemaVersion), "unsupported_corpus");
    const validator = await import(
      new URL(registry[manifest.value.schemaVersion], import.meta.url)
    );
    validator.validateManifest(manifest.value);
    validator.validateLocal(manifest.value, directory);
    result.push({ directory, manifestSha256: input.manifestSha256, manifest: manifest.value });
  }
  return result;
}

/** Pure planning seam for bounded synthetic unit fixtures; CLI always loads real validators first. */
export function planBlindReview(corpora, seed) {
  assert.ok(text(seed, 128) && /^[a-f0-9]{32,128}$/u.test(seed), "seed_must_be_hex_nonce");
  assert.ok(Array.isArray(corpora) && corpora.length > 0 && corpora.length <= 3, "corpus_count");
  const ids = new Set(),
    hashes = new Set(),
    originals = new Set(),
    groups = new Set(),
    rows = [];
  for (const corpus of corpora) {
    assert.match(corpus.manifestSha256, hashPattern);
    assert.equal(corpus.manifest.labelReviewStatus, "ai_reviewed_human_review_required");
    assert.ok(Array.isArray(corpus.manifest.fixtures));
    for (const item of corpus.manifest.fixtures) {
      assert.match(item.id, idPattern, "invalid_case_id");
      assert.match(item.sha256, hashPattern);
      assert.match(item.sourceSha1, /^[a-f0-9]{40}$/u);
      assert.ok(
        !ids.has(item.id) && !hashes.has(item.sha256) && !originals.has(item.sourceSha1),
        "duplicate_reference",
      );
      assert.ok(text(item.group, 150) && !groups.has(item.group), "duplicate_group");
      assert.ok(Number.isInteger(item.bytes) && item.bytes > 12 && item.bytes <= 1_500_000);
      assert.ok(
        Object.hasOwn(licenceUrls, item.license) && item.licenseUrl === licenceUrls[item.license],
        "unsupported_rights",
      );
      assert.ok(
        text(item.author, 700) && text(item.credit, 2500) && text(item.title, 512),
        "missing_attribution",
      );
      const page = new URL(item.pageUrl);
      assert.ok(
        page.origin === "https://commons.wikimedia.org" &&
          page.pathname.startsWith("/wiki/File:") &&
          !page.search &&
          !page.hash &&
          !page.username &&
          !page.password,
        "invalid_source",
      );
      checkedImageUrl(item.downloadUrl);
      assert.ok(["bottle", "jar", "box", "bag", "cup", "unknown"].includes(item.expectedKind));
      ids.add(item.id);
      hashes.add(item.sha256);
      originals.add(item.sourceSha1);
      groups.add(item.group);
      const digest = createHmac("sha256", seed).update(item.sha256).digest("hex");
      rows.push({
        reviewId: `r-${digest.slice(0, 20)}`,
        order: digest,
        directory: corpus.directory,
        manifestSha256: corpus.manifestSha256,
        item,
      });
    }
  }
  assert.ok(rows.length > 0 && rows.length <= 100, "case_bound");
  assert.equal(new Set(rows.map((r) => r.reviewId)).size, rows.length, "pseudonym_collision");
  return rows.sort((a, b) => a.order.localeCompare(b.order));
}

/** Read orientation metadata, not pixels; zero/unset is never a verified direction. */
function jpegOrientationDetails(bytes) {
  let position = 2,
    found;
  const tags = [];
  while (position + 4 <= bytes.length) {
    assert.equal(bytes[position++], 255, "jpeg_marker");
    while (bytes[position] === 255) position++;
    const marker = bytes[position++];
    if (marker === 0xda || marker === 0xd9) break;
    const length = bytes.readUInt16BE(position),
      end = position + length;
    assert.ok(length >= 2 && end <= bytes.length, "jpeg_segment");
    const body = bytes.subarray(position + 2, end);
    if (marker === 0xe1 && body.subarray(0, 6).equals(Buffer.from("Exif\0\0"))) {
      const tiff = body.subarray(6);
      assert.ok(tiff.length >= 8, "invalid_exif");
      const little = tiff.subarray(0, 2).equals(Buffer.from("II"));
      assert.ok(little || tiff.subarray(0, 2).equals(Buffer.from("MM")), "invalid_exif");
      const u16 = (i) => {
        assert.ok(i >= 0 && i + 2 <= tiff.length, "invalid_exif");
        return little ? tiff.readUInt16LE(i) : tiff.readUInt16BE(i);
      };
      const u32 = (i) => {
        assert.ok(i >= 0 && i + 4 <= tiff.length, "invalid_exif");
        return little ? tiff.readUInt32LE(i) : tiff.readUInt32BE(i);
      };
      assert.equal(u16(2), 42, "invalid_exif");
      const offset = u32(4),
        count = u16(offset);
      assert.ok(count <= 256 && offset + 2 + 12 * count <= tiff.length, "invalid_exif");
      for (let index = 0; index < count; index++) {
        const entry = offset + 2 + 12 * index;
        if (u16(entry) !== 0x112) continue;
        const type = u16(entry + 2),
          tagCount = u32(entry + 4);
        // A known malformed encoder convention: LONG/1/0 means no usable direction.
        // Never treat it as valid EXIF, guess a flip, or override another tag.
        if (type === 4 && tagCount === 1 && u32(entry + 8) === 0) {
          assert.ok(tags.length === 0 && found === undefined, "invalid_orientation");
          found = 0;
          tags.push({ type, count: tagCount, value: 0 });
          continue;
        }
        assert.ok(type === 3 && tagCount === 1, "invalid_orientation");
        const orientation = u16(entry + 8);
        assert.ok(
          orientation >= 1 && orientation <= 8 && (found === undefined || found === orientation),
          "invalid_orientation",
        );
        found = orientation;
        tags.push({ type, count: tagCount, value: orientation });
      }
    }
    position = end;
  }
  return {
    orientation: found === undefined || found === 0 ? 1 : found,
    sourceOrientationStatus:
      found === undefined ? "absent" : found === 0 ? "invalid_zero_unset" : "valid",
    orientationCheckRequired: found === 0,
    sourceOrientationTags: tags,
  };
}
/** Numeric display fallback only; sanitizeReviewImage retains uncertainty separately. */
export function jpegOrientation(bytes) {
  return jpegOrientationDetails(bytes).orientation;
}
function orientationSegment(value) {
  const data = Buffer.from([
    255,
    225,
    0,
    34,
    69,
    120,
    105,
    102,
    0,
    0,
    73,
    73,
    42,
    0,
    8,
    0,
    0,
    0,
    1,
    0,
    18,
    1,
    3,
    0,
    1,
    0,
    0,
    0,
    value,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
  return data;
}
let sanitizer;
async function imageSanitizer() {
  if (!sanitizer) {
    const requireMobile = createRequire(path.join(project, "mobile/app/package.json"));
    const api = await import(
      pathToFileURL(
        path.join(project, "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/esm/api/index.mjs"),
      )
    );
    const module = await api.tsImport(
      pathToFileURL(requireMobile.resolve("@kierratysappi/contracts/photo-image")).href,
      import.meta.url,
    );
    assert.equal(typeof module.stripPhotoMetadata, "function");
    sanitizer = module.stripPhotoMetadata;
  }
  return sanitizer;
}
export async function sanitizeReviewImage(bytes) {
  const strip = await imageSanitizer(),
    clean = Buffer.from(strip(bytes)),
    details = jpegOrientationDetails(bytes),
    orientation = details.orientation;
  const result =
    orientation === 1
      ? clean
      : Buffer.concat([clean.subarray(0, 2), orientationSegment(orientation), clean.subarray(2)]);
  assert.deepEqual(Buffer.from(strip(result)), clean, "sanitizer_changed_scan_stream");
  return { bytes: result, ...details };
}

const blankReview = (reviewId) => ({
  reviewId,
  label: null,
  wholeForm: null,
  privacyConcern: null,
  previouslySeen: null,
  attributionOpened: null,
  rationale: "",
});
const form = (reviewer, plan) => ({
  schemaVersion: "blind-human-review-v1",
  anonymousReviewer: reviewer,
  reviewerCode: "",
  reviewedAtUtc: "",
  independenceAttestation: null,
  noPredictionAccessAttestation: null,
  cases: plan.map((r) => blankReview(r.reviewId)),
});
const instructions = `Independent human image review — initial references are AI-only, not human accepted.\n\nTwo different people complete reviewer-A.json and reviewer-B.json independently (CSV copies are supplied for convenience). Use only anonymous A/B roles; do not enter names, contact details or personal information. Each person enters a distinct random 16–64 character lowercase hexadecimal reviewerCode and their own completed UTC date as reviewedAtUtc (YYYY-MM-DDTHH:mm:ss.sssZ). Leave these blank until actual review. Do not consult each other, predictions, the owner-only key or prior reference labels. Both attestations must be filled explicitly; generation does not count as review.\n\nFor each opaque image ID, enter label: bottle, jar, box, bag, cup, outside, mixed, or unclear. Mixed means different supported forms are present; several instances of the same supported kind can share that kind. Outside means none of the five forms is a clear target. Use unclear rather than guess. Record wholeForm, privacyConcern and previouslySeen as yes/no/unclear, and attributionOpened as yes/no. Give a brief nonpersonal rationale. Do not infer exact product, actual material, hazards, packaging/deposit status or sorting destination.\n\nThe attribution sidecar accompanies these private review files for licence compliance but is outside this initial view because titles can unblind a reference. You may access it; if opened before submitting the initial judgement, mark attributionOpened=yes. Submit independent forms before discussing differences or opening owner-only material. Images have metadata removed (only numeric orientation may remain), no pixel re-encoding, and may contain natural printed product text. Removing ICC profiles can change rendered colours even though the encoded scan stream is unchanged. Never publicly redistribute this packet automatically.\n`;

const orientationInstructions =
  "An image with orientationCheckRequired=true had an invalid LONG/count1/value0 orientation tag. Its review copy is unrotated, not a verified upright display. Do not guess a rotation or infer a label from this warning; record uncertainty in your rationale. After both initial blind submissions, a human adjudicator must compare the intended display with the original source before reference acceptance, even if both reviewers agree. Other malformed or conflicting orientation metadata is rejected.\n";

function generationSources() {
  const requireMobile = createRequire(path.join(project, "mobile/app/package.json"));
  const sources = [
    ["tool", fileURLToPath(import.meta.url)],
    ["sourceUrlValidator", fileURLToPath(new URL("./independent-corpus.mjs", import.meta.url))],
    ["publicPhotoContract", requireMobile.resolve("@kierratysappi/contracts/photo-image")],
    ["contractsPackage", path.join(project, "shared/contracts/package.json")],
    [
      "tsxPackage",
      path.join(project, "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/package.json"),
    ],
    ...Object.values(registry).map((name) => [name, fileURLToPath(new URL(name, import.meta.url))]),
  ];
  return Object.fromEntries(
    sources.map(([name, file]) => [name, sha(readBlindReviewSource(fs.realpathSync(file)))]),
  );
}

/** Writes only under ignored work; does not validate human labels or accept a release. */
export async function writeBlindReviewPacket(plan, outputInput, cwd = project) {
  const output = outputPath(outputInput, cwd),
    prepared = [],
    sourceSha256 = generationSources();
  assert.ok(Array.isArray(plan) && plan.length > 0 && plan.length <= 100);
  let total = 0;
  for (const entry of plan) {
    assert.match(entry.reviewId, /^r-[a-f0-9]{20}$/u);
    assert.match(entry.item.id, idPattern, "invalid_case_id");
    const file = workPath(path.join(entry.directory, `${entry.item.id}.jpg`), cwd);
    const source = boundedRead(file, 1_500_000);
    assert.equal(source.length, entry.item.bytes);
    assert.equal(sha(source), entry.item.sha256, "image_drift");
    const sanitized = await sanitizeReviewImage(source);
    total += sanitized.bytes.length;
    assert.ok(total <= 150_000_000, "packet_byte_bound");
    prepared.push({ ...entry, ...sanitized });
  }
  fs.mkdirSync(output, { mode: 0o700 });
  for (const folder of ["reviewer", "reviewer/images", "attribution", "owner-only"])
    fs.mkdirSync(path.join(output, folder), { mode: 0o700 });
  const ownerCases = [];
  for (const row of prepared) {
    const relative = `images/${row.reviewId}.jpg`;
    fs.writeFileSync(path.join(output, "reviewer", relative), row.bytes, {
      flag: "wx",
      mode: 0o600,
    });
    ownerCases.push({
      reviewId: row.reviewId,
      imageSha256: sha(row.bytes),
      sourceSha256: row.item.sha256,
      sourceSha1: row.item.sourceSha1,
      sourceCaseId: row.item.id,
      sourceGroup: row.item.group,
      sourceFamily: row.item.sourceFamily ?? row.item.group,
      corpusManifestSha256: row.manifestSha256,
      aiExpectedKind: row.item.expectedKind,
      aiChallenge: row.item.challenge ?? null,
      title: row.item.title,
      author: row.item.author,
      credit: row.item.credit,
      license: row.item.license,
      licenseUrl: row.item.licenseUrl,
      pageUrl: row.item.pageUrl,
      downloadUrl: row.item.downloadUrl,
      sourceReviewNote: row.item.reviewNote,
      orientation: row.orientation,
      sourceOrientationStatus: row.sourceOrientationStatus,
      sourceOrientationTags: row.sourceOrientationTags,
      orientationCheckRequired: row.orientationCheckRequired,
      changes: `${row.item.changes} Review copy: original APP/COM metadata removed; only numeric EXIF orientation retained when needed. Pixel scan stream is not re-encoded, but removing ICC profiles can change rendered colours.${row.orientationCheckRequired ? " Source orientation tag was invalid LONG/count1/value0; no transform was guessed. Display fallback is unrotated; a human must compare the intended display with the source before reference acceptance." : ""}`,
    });
  }
  const packet = {
    schemaVersion: "blind-review-packet-v1",
    referenceStatus: "ai_only_not_human_accepted",
    humanAcceptance: false,
    reviewersRequired: 2,
    labels: labelOptions,
    count: prepared.length,
    cases: prepared.map((r) => ({
      reviewId: r.reviewId,
      image: `images/${r.reviewId}.jpg`,
      sha256: sha(r.bytes),
      orientationCheckRequired: r.orientationCheckRequired,
    })),
  };
  writeJson(path.join(output, "reviewer/packet.json"), packet);
  fs.writeFileSync(
    path.join(output, "reviewer/INSTRUCTIONS.txt"),
    `${instructions}\n${orientationInstructions}`,
    {
      flag: "wx",
      mode: 0o600,
    },
  );
  const headers = [
    "reviewId",
    "label",
    "wholeForm",
    "privacyConcern",
    "previouslySeen",
    "attributionOpened",
    "rationale",
  ];
  for (const role of ["A", "B"]) {
    writeJson(path.join(output, `reviewer/reviewer-${role}.json`), form(role, prepared));
    fs.writeFileSync(
      path.join(output, `reviewer/reviewer-${role}.csv`),
      csv(
        headers,
        prepared.map((r) => [r.reviewId, "", "", "", "", "", ""]),
      ),
      { flag: "wx", mode: 0o600 },
    );
  }
  writeJson(path.join(output, "owner-only/answer-source-key.json"), {
    schemaVersion: "blind-review-owner-key-v1",
    humanAcceptance: false,
    sourceReferenceStatus: "ai_only",
    caseCount: ownerCases.length,
    cases: ownerCases,
  });
  writeJson(path.join(output, "owner-only/adjudication-template.json"), {
    schemaVersion: "blind-adjudication-v1",
    status: "not_reviewed",
    adjudicatorCode: "",
    cases: prepared.map((r) => ({
      reviewId: r.reviewId,
      reviewerALabel: null,
      reviewerBLabel: null,
      disagreement: null,
      adjudicatedLabel: null,
      rationale: "",
    })),
  });
  fs.writeFileSync(
    path.join(output, "attribution/LICENCES.csv"),
    csv(
      ["reviewId", "title", "author", "credit", "licence", "licenceUrl", "sourceUrl", "changes"],
      ownerCases.map((r) => [
        r.reviewId,
        r.title,
        r.author,
        r.credit,
        r.license,
        r.licenseUrl,
        r.pageUrl,
        r.changes,
      ]),
    ),
    { flag: "wx", mode: 0o600 },
  );
  const receipt = {
    schemaVersion: "blind-review-generation-v1",
    count: prepared.length,
    referenceStatus: "ai_only_not_human_accepted",
    humanAcceptance: false,
    imagesCopiedBytes: total,
    orientationChecksRequired: prepared.filter((r) => r.orientationCheckRequired).length,
    sourceManifestHashes: [...new Set(prepared.map((r) => r.manifestSha256))],
    sourceSha256,
    runtime: { node: process.versions.node, tsx: "4.21.0" },
    metadataPolicy: "app_com_removed_minimal_orientation_only_colour_rendering_may_change",
    packetSha256: sha(boundedRead(path.join(output, "reviewer/packet.json"), 100_000)),
    ownerKeySha256: sha(
      boundedRead(path.join(output, "owner-only/answer-source-key.json"), 2_000_000),
    ),
    networkCalls: 0,
    inferenceCalls: 0,
  };
  writeJson(path.join(output, "owner-only/generation-receipt.json"), receipt);
  return { directory: path.relative(cwd, output), ...receipt };
}
export async function generateBlindReviewPacket(options, cwd = project) {
  const corpora = await loadFrozenCorpora(options.corpora, cwd);
  return writeBlindReviewPacket(planBlindReview(corpora, options.seed), options.output, cwd);
}

export function compareHumanReviews(key, a, b) {
  assert.equal(key.schemaVersion, "blind-review-owner-key-v1");
  assert.ok(Array.isArray(key.cases) && key.cases.length > 0 && key.cases.length <= 100);
  const ids = key.cases.map((r) => r.reviewId);
  assert.equal(new Set(ids).size, ids.length);
  const checked = (review, role) => {
    assert.equal(review.schemaVersion, "blind-human-review-v1");
    assert.equal(review.anonymousReviewer, role);
    assert.match(review.reviewerCode, /^[a-f0-9]{16,64}$/u, "anonymous_reviewer_code_required");
    assert.ok(
      typeof review.reviewedAtUtc === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(review.reviewedAtUtc) &&
        Number.isFinite(Date.parse(review.reviewedAtUtc)) &&
        new Date(review.reviewedAtUtc).toISOString() === review.reviewedAtUtc,
      "review_date_required",
    );
    assert.equal(review.independenceAttestation, true, "independence_not_attested");
    assert.equal(review.noPredictionAccessAttestation, true, "blindness_not_attested");
    assert.ok(Array.isArray(review.cases) && review.cases.length === ids.length);
    const map = new Map();
    for (const row of review.cases) {
      assert.deepEqual(
        Object.keys(row).sort(),
        [
          "reviewId",
          "label",
          "wholeForm",
          "privacyConcern",
          "previouslySeen",
          "attributionOpened",
          "rationale",
        ].sort(),
      );
      assert.ok(
        ids.includes(row.reviewId) && !map.has(row.reviewId),
        "duplicate_or_unknown_review_id",
      );
      assert.ok(
        labelOptions.includes(row.label) &&
          yesNo.includes(row.wholeForm) &&
          yesNo.includes(row.privacyConcern) &&
          yesNo.includes(row.previouslySeen) &&
          ["yes", "no"].includes(row.attributionOpened),
        "incomplete_review",
      );
      assert.ok(text(row.rationale, 1000), "rationale_required");
      map.set(row.reviewId, row);
    }
    return map;
  };
  const first = checked(a, "A"),
    second = checked(b, "B");
  assert.notEqual(a.reviewerCode, b.reviewerCode, "distinct_reviewers_required");
  const cases = ids.map((reviewId) => {
    const left = first.get(reviewId),
      right = second.get(reviewId);
    const orientationCheckRequired =
      key.cases.find((r) => r.reviewId === reviewId).orientationCheckRequired === true;
    const disagreement = ["label", "wholeForm", "privacyConcern"].some(
      (field) => left[field] !== right[field],
    );
    const exposureOrEligibilityConcern = [left, right].some(
      (r) =>
        r.previouslySeen !== "no" ||
        r.attributionOpened !== "no" ||
        r.privacyConcern !== "no" ||
        r.wholeForm !== "yes",
    );
    return {
      reviewId,
      reviewerA: left,
      reviewerB: right,
      disagreement,
      exposureOrEligibilityConcern,
      orientationCheckRequired,
      adjudicationRequired:
        disagreement || exposureOrEligibilityConcern || orientationCheckRequired,
      adjudicatedLabel: null,
      adjudicatorCode: "",
      rationale: "",
    };
  });
  return {
    schemaVersion: "blind-review-comparison-v1",
    status: "human_reviews_recorded_owner_acceptance_pending",
    humanAcceptance: false,
    reviewerA: { code: a.reviewerCode, reviewedAtUtc: a.reviewedAtUtc },
    reviewerB: { code: b.reviewerCode, reviewedAtUtc: b.reviewedAtUtc },
    count: cases.length,
    disagreements: cases.filter((r) => r.disagreement).length,
    adjudicationsRequired: cases.filter((r) => r.adjudicationRequired).length,
    cases,
  };
}
export function reconcileBlindReviews(options, cwd = project) {
  const key = readJson(workPath(options.key, cwd)),
    a = readJson(workPath(options.a, cwd)),
    b = readJson(workPath(options.b, cwd));
  const result = compareHumanReviews(key.value, a.value, b.value),
    output = outputPath(options.output, cwd);
  fs.mkdirSync(output, { mode: 0o700 });
  writeJson(path.join(output, "comparison.json"), result);
  writeJson(path.join(output, "input-receipt.json"), {
    keySha256: sha(key.bytes),
    reviewerASha256: sha(a.bytes),
    reviewerBSha256: sha(b.bytes),
    humanAcceptance: false,
    networkCalls: 0,
    inferenceCalls: 0,
  });
  return {
    directory: path.relative(cwd, output),
    count: result.count,
    disagreements: result.disagreements,
    adjudicationsRequired: result.adjudicationsRequired,
    humanAcceptance: false,
  };
}
export function parseArguments(args) {
  const options = { corpora: [] };
  const mode = args[0];
  assert.ok(["--prepare", "--reconcile"].includes(mode), "explicit_mode_required");
  for (let i = 1; i < args.length; i++) {
    const name = args[i];
    if (name === "--corpus") {
      assert.equal(mode, "--prepare");
      const directory = args[++i],
        manifestSha256 = args[++i];
      assert.ok(directory && !directory.startsWith("--"));
      assert.match(manifestSha256 ?? "", hashPattern);
      options.corpora.push({ directory, manifestSha256 });
      continue;
    }
    assert.ok(["--seed", "--output", "--key", "--a", "--b"].includes(name));
    const key = name.slice(2),
      value = args[++i];
    assert.ok(value && !value.startsWith("--") && !(key in options));
    options[key] = value;
  }
  assert.ok(options.output);
  if (mode === "--prepare")
    assert.ok(
      options.seed && options.corpora.length > 0 && !options.key && !options.a && !options.b,
    );
  else
    assert.ok(
      options.key && options.a && options.b && !options.seed && options.corpora.length === 0,
    );
  return { mode, options };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { mode, options } = parseArguments(process.argv.slice(2));
    console.log(
      JSON.stringify(
        mode === "--prepare"
          ? await generateBlindReviewPacket(options)
          : reconcileBlindReviews(options),
      ),
    );
  } catch {
    console.error("blind_review_failed; preserve any partial output, never overwrite it");
    process.exitCode = 1;
  }
}
