import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  compareHumanReviews,
  csvCell,
  jpegOrientation,
  loadFrozenCorpora,
  parseArguments,
  planBlindReview,
  readBlindReviewSource,
  sanitizeReviewImage,
  writeBlindReviewPacket,
} from "../qa/local-vision/blind-review-packet.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const seed = "b7".repeat(32);
// Bounded JPEG marker-stream fixture for metadata/workflow tests, not camera accuracy.
function image(note = "Answer_bottle_private_name.jpg") {
  const payload = Buffer.from(note),
    length = payload.length + 2;
  return Buffer.concat([
    Buffer.from([255, 216, 255, 254, length >> 8, length & 255]),
    payload,
    Buffer.from([
      255, 192, 0, 11, 8, 0, 16, 0, 16, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 42, 255, 0,
      17, 255, 217,
    ]),
  ]);
}
function orientationImage(clean, { little = true, type = 3, count = 1, value = 6 } = {}) {
  const segment = Buffer.alloc(36);
  segment.set([255, 225, 0, 34, 69, 120, 105, 102, 0, 0]);
  segment.write(little ? "II" : "MM", 10, "ascii");
  const u16 = (v, i) => (little ? segment.writeUInt16LE(v, i) : segment.writeUInt16BE(v, i));
  const u32 = (v, i) => (little ? segment.writeUInt32LE(v, i) : segment.writeUInt32BE(v, i));
  u16(42, 12);
  u32(8, 14);
  u16(1, 18);
  u16(0x112, 20);
  u16(type, 22);
  u32(count, 24);
  if (type === 3) u16(value, 28);
  else u32(value, 28);
  return Buffer.concat([clean.subarray(0, 2), segment, clean.subarray(2)]);
}
function temporary(t) {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporaryRoot, "kig-blind-review-"));
  fs.mkdirSync(path.join(root, "work"));
  t.after(() => {
    assert.ok(root.startsWith(path.join(temporaryRoot, "kig-blind-review-")));
    assert.ok(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink());
    fs.rmSync(root, { recursive: true });
  });
  return root;
}

test("only pinned tsx metadata permits pnpm package-store hard links", (t) => {
  const cwd = temporary(t);
  const directory = path.join(cwd, "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx");
  fs.mkdirSync(directory, { recursive: true });
  const metadata = path.join(directory, "package.json");
  const bytes = JSON.stringify({ name: "tsx", version: "4.21.0" });
  fs.writeFileSync(metadata, bytes);
  const alias = path.join(cwd, "work/cache-alias");
  fs.linkSync(metadata, alias);
  assert.equal(readBlindReviewSource(metadata, cwd).toString(), bytes);
  assert.throws(() => readBlindReviewSource(alias, cwd), /file_bound/u);
  const imagePath = path.join(cwd, "work/image.jpg");
  fs.writeFileSync(imagePath, image());
  fs.linkSync(imagePath, path.join(cwd, "work/image-alias"));
  assert.throws(() => readBlindReviewSource(imagePath, cwd), /file_bound/u);
  fs.writeFileSync(metadata, JSON.stringify({ name: "other", version: "4.21.0" }));
  assert.throws(() => readBlindReviewSource(metadata, cwd), /runtime_package/u);
  fs.writeFileSync(metadata, JSON.stringify({ name: "tsx", version: "5.0.0" }));
  assert.throws(() => readBlindReviewSource(metadata, cwd), /runtime_version/u);
  fs.writeFileSync(metadata, "x".repeat(1_000_001));
  assert.throws(() => readBlindReviewSource(metadata, cwd), /file_bound/u);
});
function fixture(t, count = 3) {
  const cwd = temporary(t),
    directory = path.join(cwd, "work", "corpus");
  fs.mkdirSync(directory);
  const fixtures = Array.from({ length: count }, (_, index) => {
    const bytes = image(`Answer_bottle_private_name_${index}.jpg`),
      id = `secret-source-${index}`;
    fs.writeFileSync(path.join(directory, `${id}.jpg`), bytes);
    return {
      id,
      bytes: bytes.length,
      sha256: sha(bytes),
      sourceSha1: String(index + 1).padStart(40, "0"),
      group: `group-${index}`,
      expectedKind: "bottle",
      title: `File:Answer_IS_bottle_${index}.jpg`,
      author: "Public author",
      credit: "Public credit",
      license: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      pageUrl: `https://commons.wikimedia.org/wiki/File:Answer_IS_bottle_${index}.jpg`,
      downloadUrl: `https://upload.wikimedia.org/wikipedia/commons/a/ab/image${index}.jpg`,
      changes: "Synthetic codec fixture, not reference quality.",
    };
  });
  return {
    cwd,
    directory,
    corpora: [
      {
        directory,
        manifestSha256: "a".repeat(64),
        manifest: { labelReviewStatus: "ai_reviewed_human_review_required", fixtures },
      },
    ],
  };
}
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

test("opaque pseudonyms and order are deterministic without labels or original IDs", (t) => {
  const f = fixture(t, 8),
    plan = planBlindReview(f.corpora, seed),
    again = planBlindReview(f.corpora, seed);
  assert.deepEqual(
    plan.map((r) => r.reviewId),
    again.map((r) => r.reviewId),
  );
  assert.notDeepEqual(
    plan.map((r) => r.item.id),
    f.corpora[0].manifest.fixtures.map((r) => r.id),
  );
  assert.ok(plan.every((r) => /^r-[a-f0-9]{20}$/u.test(r.reviewId)));
  const changed = structuredClone(f.corpora);
  changed[0].manifest.fixtures.forEach((r) => {
    r.expectedKind = "cup";
  });
  assert.deepEqual(
    plan.map((r) => r.reviewId),
    planBlindReview(changed, seed).map((r) => r.reviewId),
  );
  assert.notDeepEqual(
    plan.map((r) => r.reviewId),
    planBlindReview(f.corpora, "c8".repeat(32)).map((r) => r.reviewId),
  );
});
for (const field of ["id", "sha256", "sourceSha1", "group"])
  test(`duplicate ${field} is rejected before copying`, (t) => {
    const f = fixture(t);
    f.corpora[0].manifest.fixtures[1][field] = f.corpora[0].manifest.fixtures[0][field];
    assert.throws(() => planBlindReview(f.corpora, seed));
  });
test("malformed rights, paths, sizes, IDs, labels and seeds fail closed", (t) => {
  const f = fixture(t);
  for (const change of [
    (r) => {
      r.id = "../escape";
    },
    (r) => {
      r.bytes = 1500001;
    },
    (r) => {
      r.sha256 = "not-hash";
    },
    (r) => {
      r.license = "unknown";
    },
    (r) => {
      r.credit = "";
    },
    (r) => {
      r.pageUrl = "https://evil.invalid/";
    },
    (r) => {
      r.downloadUrl = "file:///private.jpg";
    },
    (r) => {
      r.expectedKind = "verified_plastic";
    },
  ]) {
    const c = structuredClone(f.corpora);
    change(c[0].manifest.fixtures[0]);
    assert.throws(() => planBlindReview(c, seed));
  }
  for (const bad of ["", "password", "x".repeat(200)])
    assert.throws(() => planBlindReview(f.corpora, bad));
});
test("actual CLI corpus loading rejects changed hashes and unknown registry without output", async (t) => {
  const f = fixture(t),
    data = Buffer.from(JSON.stringify({ schemaVersion: "untrusted" }));
  fs.writeFileSync(path.join(f.directory, "fixtures.json"), data);
  await assert.rejects(
    loadFrozenCorpora([{ directory: f.directory, manifestSha256: "0".repeat(64) }], f.cwd),
  );
  await assert.rejects(
    loadFrozenCorpora([{ directory: f.directory, manifestSha256: sha(data) }], f.cwd),
  );
});
test("metadata sanitizer removes answer-bearing comments without re-encoding the scan", async () => {
  const original = image(),
    cleaned = await sanitizeReviewImage(original);
  assert.equal(cleaned.orientation, 1);
  assert.equal(cleaned.bytes.includes(Buffer.from("Answer_bottle")), false);
  assert.ok(cleaned.bytes.length < original.length);
  assert.deepEqual((await sanitizeReviewImage(cleaned.bytes)).bytes, cleaned.bytes);
  await assert.rejects(sanitizeReviewImage(Buffer.from("not-a-jpeg")));
});
test("only validated numeric orientation survives, not original EXIF captions", async () => {
  const clean = (await sanitizeReviewImage(image())).bytes;
  const orientation = Buffer.from([
    255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0,
    0, 6, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const original = Buffer.concat([clean.subarray(0, 2), orientation, clean.subarray(2)]);
  const result = await sanitizeReviewImage(original);
  assert.equal(result.orientation, 6);
  assert.equal(jpegOrientation(result.bytes), 6);
  const invalid = Buffer.from(original);
  invalid[30] = 9;
  await assert.rejects(sanitizeReviewImage(invalid));
});
test("exact LONG/count1/value0 is unrotated and explicitly requires human direction review", async () => {
  const clean = (await sanitizeReviewImage(image())).bytes;
  for (const little of [true, false]) {
    const result = await sanitizeReviewImage(
      orientationImage(clean, { little, type: 4, value: 0 }),
    );
    assert.deepEqual(result.bytes, clean);
    assert.equal(result.orientation, 1);
    assert.equal(result.sourceOrientationStatus, "invalid_zero_unset");
    assert.equal(result.orientationCheckRequired, true);
    assert.deepEqual(result.sourceOrientationTags, [{ type: 4, count: 1, value: 0 }]);
  }
  for (const options of [
    { type: 4, value: 1 },
    { type: 4, value: 0, count: 2 },
    { type: 3, value: 0 },
    { type: 3, value: 9 },
    { type: 2, value: 0 },
  ]) {
    await assert.rejects(sanitizeReviewImage(orientationImage(clean, options)));
  }
  const zero = orientationImage(clean, { type: 4, value: 0 });
  await assert.rejects(sanitizeReviewImage(orientationImage(zero, { type: 4, value: 0 })));
  await assert.rejects(sanitizeReviewImage(orientationImage(zero, { value: 6 })));
  const valid = orientationImage(clean, { value: 6 });
  await assert.rejects(sanitizeReviewImage(orientationImage(valid, { value: 1 })));
  await assert.rejects(sanitizeReviewImage(orientationImage(valid, { type: 4, value: 0 })));
});
test("invalid unset orientation is recorded for reviewers and cannot skip adjudication", async (t) => {
  const f = fixture(t, 1),
    item = f.corpora[0].manifest.fixtures[0];
  const data = orientationImage(image(), { little: false, type: 4, value: 0 });
  fs.writeFileSync(path.join(f.directory, `${item.id}.jpg`), data);
  item.bytes = data.length;
  item.sha256 = sha(data);
  const receipt = await writeBlindReviewPacket(
    planBlindReview(f.corpora, seed),
    "work/unset",
    f.cwd,
  );
  const out = path.join(f.cwd, receipt.directory);
  assert.equal(receipt.orientationChecksRequired, 1);
  assert.equal(
    read(path.join(out, "reviewer/packet.json")).cases[0].orientationCheckRequired,
    true,
  );
  const key = read(path.join(out, "owner-only/answer-source-key.json"));
  assert.equal(key.cases[0].sourceOrientationStatus, "invalid_zero_unset");
  assert.deepEqual(key.cases[0].sourceOrientationTags, [{ type: 4, count: 1, value: 0 }]);
  assert.match(key.cases[0].changes, /human must compare the intended display with the source/u);
  const complete = (role) => ({
    ...read(path.join(out, `reviewer/reviewer-${role}.json`)),
    reviewerCode: (role === "A" ? "a" : "b").repeat(32),
    reviewedAtUtc: "2026-11-08T12:00:00.000Z",
    independenceAttestation: true,
    noPredictionAccessAttestation: true,
    cases: [
      {
        reviewId: key.cases[0].reviewId,
        label: "bottle",
        wholeForm: "yes",
        privacyConcern: "no",
        previouslySeen: "no",
        attributionOpened: "no",
        rationale: "Visible whole form.",
      },
    ],
  });
  const result = compareHumanReviews(key, complete("A"), complete("B"));
  assert.equal(result.disagreements, 0);
  assert.equal(result.adjudicationsRequired, 1);
  assert.equal(result.cases[0].adjudicatedLabel, null);
  assert.equal(result.humanAcceptance, false);
});
test("reviewer packet has blank independent forms and no reference/source leakage", async (t) => {
  const f = fixture(t),
    plan = planBlindReview(f.corpora, seed);
  const receipt = await writeBlindReviewPacket(plan, "work/packet", f.cwd),
    out = path.join(f.cwd, receipt.directory);
  assert.equal(receipt.count, 3);
  assert.equal(receipt.humanAcceptance, false);
  assert.equal(receipt.inferenceCalls, 0);
  assert.equal(receipt.networkCalls, 0);
  const packet = read(path.join(out, "reviewer/packet.json"));
  assert.equal(packet.referenceStatus, "ai_only_not_human_accepted");
  const forms = ["A", "B"].map((role) => read(path.join(out, `reviewer/reviewer-${role}.json`)));
  for (const form of forms) {
    assert.equal(form.independenceAttestation, null);
    assert.equal(form.noPredictionAccessAttestation, null);
    assert.equal(form.reviewerCode, "");
    assert.equal(form.reviewedAtUtc, "");
    assert.ok(form.cases.every((r) => r.label === null && r.rationale === ""));
  }
  assert.match(receipt.sourceSha256.tool, /^[a-f0-9]{64}$/u);
  assert.match(receipt.sourceSha256.publicPhotoContract, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.runtime.tsx, "4.21.0");
  assert.ok(
    packet.cases.every(
      (r) => r.sha256 === sha(fs.readFileSync(path.join(out, "reviewer", r.image))),
    ),
  );
  for (const name of fs.readdirSync(path.join(out, "reviewer"))) {
    if (fs.statSync(path.join(out, "reviewer", name)).isDirectory()) continue;
    const content = fs.readFileSync(path.join(out, "reviewer", name), "utf8");
    for (const leak of [
      "secret-source-",
      "Answer_IS_bottle",
      "aiExpectedKind",
      "expectedKind",
      "Public author",
    ])
      assert.ok(!content.includes(leak));
  }
  for (const name of fs.readdirSync(path.join(out, "reviewer/images"))) {
    assert.match(name, /^r-[a-f0-9]{20}\.jpg$/u);
    assert.ok(
      !fs
        .readFileSync(path.join(out, "reviewer/images", name))
        .includes(Buffer.from("Answer_bottle")),
    );
  }
  const key = read(path.join(out, "owner-only/answer-source-key.json"));
  assert.ok(
    key.cases.every((r) => r.aiExpectedKind === "bottle" && r.sourceSha256 && r.imageSha256),
  );
  assert.match(
    fs.readFileSync(path.join(out, "attribution/LICENCES.csv"), "utf8"),
    /Public author/,
  );
  await assert.rejects(writeBlindReviewPacket(plan, "work/packet", f.cwd));
});
test("changed image bytes fail before any packet directory is created", async (t) => {
  const f = fixture(t),
    plan = planBlindReview(f.corpora, seed);
  fs.writeFileSync(path.join(f.directory, `${plan[0].item.id}.jpg`), image("altered"));
  await assert.rejects(writeBlindReviewPacket(plan, "work/output", f.cwd));
  assert.equal(fs.existsSync(path.join(f.cwd, "work/output")), false);
});
test("symbolic and hard-linked inputs and linked output parents are refused", async (t) => {
  const f = fixture(t),
    plan = planBlindReview(f.corpora, seed),
    imagePath = path.join(f.directory, `${plan[0].item.id}.jpg`);
  fs.renameSync(imagePath, `${imagePath}.owned`);
  fs.symlinkSync(`${imagePath}.owned`, imagePath);
  await assert.rejects(writeBlindReviewPacket(plan, "work/symlink-output", f.cwd));
  fs.unlinkSync(imagePath);
  fs.linkSync(`${imagePath}.owned`, imagePath);
  await assert.rejects(writeBlindReviewPacket(plan, "work/hardlink-output", f.cwd));
  fs.mkdirSync(path.join(f.cwd, "work/real"));
  fs.symlinkSync(path.join(f.cwd, "work/real"), path.join(f.cwd, "work/alias"));
  await assert.rejects(writeBlindReviewPacket(plan, "work/alias/output", f.cwd));
  await assert.rejects(writeBlindReviewPacket(plan, "outside/output", f.cwd));
});
test("CSV metadata cannot start a spreadsheet formula", () => {
  for (const v of ["=SUM(1,2)", "+1", "-1", "@lookup", "  =cmd"])
    assert.ok(csvCell(v).startsWith("\"'"));
  assert.equal(csvCell('a"b'), '"a""b"');
});
test("two human forms must be complete and explicitly attest independent blind review", (t) => {
  const f = fixture(t),
    plan = planBlindReview(f.corpora, seed),
    key = {
      schemaVersion: "blind-review-owner-key-v1",
      cases: plan.map((r) => ({ reviewId: r.reviewId, aiExpectedKind: "bottle" })),
    };
  const make = (role) => ({
    schemaVersion: "blind-human-review-v1",
    anonymousReviewer: role,
    reviewerCode: (role === "A" ? "a" : "b").repeat(32),
    reviewedAtUtc: "2026-11-08T12:00:00.000Z",
    independenceAttestation: true,
    noPredictionAccessAttestation: true,
    cases: plan.map((r) => ({
      reviewId: r.reviewId,
      label: "jar",
      wholeForm: "yes",
      privacyConcern: "no",
      previouslySeen: "no",
      attributionOpened: "no",
      rationale: "Visible broad-mouth jar.",
    })),
  });
  const a = make("A"),
    b = make("B");
  const agree = compareHumanReviews(key, a, b);
  assert.equal(agree.disagreements, 0);
  assert.equal(agree.humanAcceptance, false);
  assert.equal(agree.status, "human_reviews_recorded_owner_acceptance_pending");
  b.cases[0].label = "mixed";
  assert.equal(compareHumanReviews(key, a, b).disagreements, 1);
  b.cases[1].attributionOpened = "yes";
  assert.equal(compareHumanReviews(key, a, b).adjudicationsRequired, 2);
  for (const change of [
    (r) => {
      r.independenceAttestation = null;
    },
    (r) => {
      r.noPredictionAccessAttestation = null;
    },
    (r) => {
      r.reviewedAtUtc = "";
    },
    (r) => {
      r.reviewedAtUtc = "2026-02-30T12:00:00.000Z";
    },
    (r) => {
      r.reviewerCode = b.reviewerCode;
    },
    (r) => {
      r.cases[0].label = null;
    },
    (r) => {
      r.cases[0].reviewId = r.cases[1].reviewId;
    },
    (r) => {
      r.cases[0].aiExpectedKind = "bottle";
    },
  ]) {
    const bad = structuredClone(a);
    change(bad);
    assert.throws(() => compareHumanReviews(key, bad, b));
  }
  assert.ok(agree.cases.every((r) => r.adjudicatedLabel === null && r.adjudicatorCode === ""));
});
test("CLI requires explicit paired manifest hashes and disjoint prepare/reconcile inputs", () => {
  const args = [
    "--prepare",
    "--corpus",
    "work/data",
    "a".repeat(64),
    "--seed",
    seed,
    "--output",
    "work/new",
  ];
  assert.equal(parseArguments(args).options.corpora.length, 1);
  assert.throws(() => parseArguments(args.slice(1)));
  assert.throws(() => parseArguments([...args, "--seed", seed]));
  assert.throws(() => parseArguments([...args, "--key", "work/key"]));
  assert.equal(
    parseArguments([
      "--reconcile",
      "--key",
      "work/key",
      "--a",
      "work/a",
      "--b",
      "work/b",
      "--output",
      "work/new",
    ]).mode,
    "--reconcile",
  );
});
test("offline packet source has no network, model runner or credential interface", () => {
  const source = fs.readFileSync(
    new URL("../qa/local-vision/blind-review-packet.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /fetch\(|spawnSync|child_process|OPENAI_API_KEY|MLModel|predict\(/u);
  assert.match(source, /validator\.validateManifest/);
  assert.match(source, /validator\.validateLocal/);
});
