import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";

const base = "mobile/app/modules/local-vision/android/";
const read = (name) => fs.readFileSync(name, "utf8");
const engine = () =>
  read(`${base}src/main/java/fi/roopeaaltonen/localvision/android-vision-engine.kt`);

test("Android ships the pinned independent model with licence, never test photographs", async () => {
  assert.match(read(".gitattributes"), /^\*\.onnx binary$/m);
  const dir = `${base}src/main/assets/siglip/`;
  const manifest = JSON.parse(read(`${dir}manifest.json`));
  const hash = createHash("sha256");
  for await (const block of fs.createReadStream(`${dir}vision-int8.onnx`)) hash.update(block);
  assert.equal(
    hash.digest("hex"),
    "d90cf29df7a26cd39d5c8d03c0b6c13179f03e8e905659111be3cbf54552984b",
  );

  test("Android parity fixtures preserve independent bytes and source/licence lineage", () => {
    const dir = `${base}src/androidTest/assets/parity/`;
    const expected = JSON.parse(read(`${dir}expected.json`));
    assert.equal(expected.maximumScoreError, 0.005);
    assert.equal(expected.rows.length, 4);
    for (const row of expected.rows) {
      assert.match(row.file, /^commons-[1-4]-clean\.jpg$/);
      assert.equal(
        createHash("sha256")
          .update(fs.readFileSync(dir + row.file))
          .digest("hex"),
        row.sha256,
      );
      assert.match(row.sourceUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      assert.match(row.licenceUrl, /^https:\/\/creativecommons\.org\//);
      assert.ok(row.artist && row.changes && row.scores.length === 15);
    }
  });
  assert.equal(fs.statSync(`${dir}vision-int8.onnx`).size, 95661204);
  assert.equal(manifest.licence, "Apache-2.0");
  assert.equal(manifest.modelBytes, 95661204);
  assert.match(read(`${dir}LICENSE-APACHE2.txt`), /Apache License/);
  assert.match(read(`${dir}pillow-mit-cmu.txt`), /Permission/);
  assert.equal(
    createHash("sha256")
      .update(fs.readFileSync(`${dir}prototypes.json`))
      .digest("hex"),
    "eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21",
  );
  assert.deepEqual(
    fs.readdirSync(dir).sort(),
    [
      "LICENSE-APACHE2.txt",
      "manifest.json",
      "pillow-mit-cmu.txt",
      "prototypes.json",
      "vision-int8.onnx",
    ].sort(),
  );
});

test("Android worker owns cancellation, bounded pixels and a streamed model rather than a heap-sized byte array", () => {
  const source = engine();
  for (const marker of [
    "current.compareAndSet(null,job)",
    "current.compareAndSet(job,null)",
    "setTerminate(true)",
    "NOFOLLOW_LINKS",
    "ByteArray(65536)",
    "createSession(model.absolutePath,options)",
    "session.run(",
    "bitmap.recycle()",
    "text.close();scanner.close()",
    "1_500_000",
    "8_000_000",
    "uncalibrated",
    "object_form_only",
  ])
    assert.ok(source.includes(marker), marker);
  assert.doesNotMatch(
    source,
    /readBytes\(|URL\(|HttpClient|OkHttp|Log\.|println\(|OPENAI|client_secret/,
  );
  assert.match(source, /timeoutMs !in 1\.\.12000/);
  assert.match(source, /marks[\s\S]*?\.distinct\(\)\.take\(24\)/);
  assert.match(source, /codes[\s\S]*?\.distinct\(\)\.take\(8\)/);
});

test("Android uses bundled OCR and explicit platform registration, not Apple metadata", () => {
  const gradle = read(`${base}build.gradle`);
  assert.match(gradle, /minSdkVersion 26/);
  assert.match(gradle, /onnxruntime-android:1\.32\.0/);
  assert.match(gradle, /com\.google\.mlkit:text-recognition:16\.0\.1/);
  assert.doesNotMatch(gradle, /play-services-mlkit-text/);
  const config = JSON.parse(read("mobile/app/modules/local-vision/expo-module.config.json"));
  assert.deepEqual(config.platforms, ["apple", "android"]);
  assert.deepEqual(config.android.modules, ["fi.roopeaaltonen.localvision.LocalVisionModule"]);
  assert.doesNotMatch(
    engine(),
    /apple-class-operating-point|classificationRevision|mobileclip|confidence.*verified/,
  );
  const privacy = read("mobile/localization/src/assessment.ts");
  assert.equal((privacy.match(/androidPrivacyInformation:/g) ?? []).length, 2);
  assert.match(read("mobile/app/src/app/legal.tsx"), /t\("androidPrivacyInformation"\)/);
  assert.match(
    read("mobile/app/src/app/local-photo.tsx"),
    /mode === "material" \|\| androidEvidence\.codes\.length > 0/,
  );
});
