import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  generateInterfaceSounds,
  SOUND_NAMES,
  SOUND_SAMPLE_RATE,
  SOUND_SPEC,
  synthesizeSound,
} from "../generate-interface-sounds.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/u, "");
const hash = (value) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kig-interface-sounds-")));
  fs.mkdirSync(path.join(root, "mobile/app/assets"), { recursive: true });
  return root;
}
function samples(wav) {
  return Array.from({ length: (wav.length - 44) / 2 }, (_, index) =>
    wav.readInt16LE(44 + index * 2),
  );
}

test("four original tones have standard mono PCM WAV structure and exact bounded lengths", () => {
  assert.deepEqual(SOUND_NAMES, ["tap", "ready", "confirm", "attention"]);
  assert.equal(SOUND_SAMPLE_RATE, 22_050);
  let totalBytes = 0;
  for (const name of SOUND_NAMES) {
    const wav = synthesizeSound(name);
    const count = Math.round((SOUND_SAMPLE_RATE * SOUND_SPEC[name].durationMs) / 1000);
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt32LE(4), wav.length - 8);
    assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
    assert.equal(wav.readUInt32LE(16), 16);
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), SOUND_SAMPLE_RATE);
    assert.equal(wav.readUInt32LE(28), SOUND_SAMPLE_RATE * 2);
    assert.equal(wav.readUInt16LE(32), 2);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.toString("ascii", 36, 40), "data");
    assert.equal(wav.readUInt32LE(40), count * 2);
    assert.equal(wav.length, 44 + count * 2);
    assert.ok((count * 1000) / SOUND_SAMPLE_RATE <= 201);
    totalBytes += wav.length;
  }
  assert.equal(totalBytes, 22_006);
});

test("PCM is quiet, nonempty, unclipped and exact zero DC without hard endpoints", () => {
  for (const name of SOUND_NAMES) {
    const values = samples(synthesizeSound(name));
    const peak = Math.max(...values.map(Math.abs)) / 32_767;
    const rms =
      Math.sqrt(values.reduce((total, value) => total + value * value, 0) / values.length) / 32_767;
    assert.ok(peak > 0.04 && peak < 0.25, `${name} peak bound`);
    assert.ok(rms > 0.01 && rms < 0.15, `${name} RMS bound`);
    assert.equal(
      values.reduce((sum, value) => sum + value, 0),
      0,
      `${name} exact DC`,
    );
    assert.equal(values[0], 0);
    assert.equal(values.at(-1), 0);
    for (const [startMs, lengthMs] of SOUND_SPEC[name].notes) {
      const start = Math.round((SOUND_SAMPLE_RATE * startMs) / 1000);
      const length = Math.min(
        Math.round((SOUND_SAMPLE_RATE * lengthMs) / 1000),
        values.length - start,
      );
      const note = values.slice(start, start + length);
      assert.equal(note[0], 0, `${name} note attack starts at zero`);
      assert.equal(note.at(-1), 0, `${name} note release ends at zero`);
      for (let i = 0; i < Math.floor(note.length / 2); i++)
        assert.equal(note[i] + note[note.length - 1 - i], 0, `${name} antisymmetry`);
      const fade = Math.min(40, Math.floor(note.length / 10));
      assert.ok(
        Math.max(...note.slice(0, fade).map(Math.abs)) < 32_767 * 0.01,
        `${name} smooth attack`,
      );
      assert.ok(
        Math.max(...note.slice(-fade).map(Math.abs)) < 32_767 * 0.01,
        `${name} smooth release`,
      );
    }
  }
});

test("tone synthesis is deterministic, distinct, data-only and rejects unknown cue names", () => {
  const fingerprints = new Set();
  for (const name of SOUND_NAMES) {
    const first = synthesizeSound(name);
    assert.deepEqual(first, synthesizeSound(name));
    fingerprints.add(hash(first));
    assert.ok(Object.isFrozen(SOUND_SPEC[name]));
    assert.ok(Object.isFrozen(SOUND_SPEC[name].notes));
    assert.ok(SOUND_SPEC[name].notes.every(Object.isFrozen));
  }
  assert.equal(fingerprints.size, 4);
  for (const cue of ["unknown", "../outside", "constructor", "tap.wav", undefined, null])
    assert.throws(() => synthesizeSound(cue), /unknown_sound/u);
});

test("checked-in assets exactly reproduce source without check-mode writes", () => {
  const files = SOUND_NAMES.map((name) =>
    path.join(repositoryRoot, "mobile/app/assets/sounds", `${name}.wav`),
  );
  const before = files.map((file) => fs.statSync(file, { bigint: true }));
  const result = generateInterfaceSounds(repositoryRoot, true);
  assert.equal(result.length, 4);
  for (const [index, file] of files.entries()) {
    const name = SOUND_NAMES[index];
    assert.deepEqual(fs.readFileSync(file), synthesizeSound(name));
    assert.equal(fs.statSync(file, { bigint: true }).mtimeNs, before[index].mtimeNs);
  }
});

test("writes only absent known files and never rewrites already matching assets", () => {
  const root = fixture();
  const first = generateInterfaceSounds(root);
  const directory = path.join(root, "mobile/app/assets/sounds");
  assert.deepEqual(
    fs.readdirSync(directory).sort(),
    SOUND_NAMES.map((name) => `${name}.wav`).sort(),
  );
  const before = SOUND_NAMES.map((name) =>
    fs.statSync(path.join(directory, `${name}.wav`), { bigint: true }),
  );
  assert.deepEqual(generateInterfaceSounds(root), first);
  assert.deepEqual(generateInterfaceSounds(root, true), first);
  for (const [index, name] of SOUND_NAMES.entries())
    assert.equal(
      fs.statSync(path.join(directory, `${name}.wav`), { bigint: true }).mtimeNs,
      before[index].mtimeNs,
    );
});

test("preflights all known targets and refuses unknown bytes without creating earlier missing outputs", () => {
  const root = fixture();
  const directory = path.join(root, "mobile/app/assets/sounds");
  fs.mkdirSync(directory);
  const unknown = path.join(directory, "confirm.wav");
  fs.writeFileSync(unknown, "retained-owner-file", { flag: "wx" });
  assert.throws(() => generateInterfaceSounds(root), /existing_sound_differs/u);
  assert.equal(fs.readFileSync(unknown, "utf8"), "retained-owner-file");
  assert.deepEqual(fs.readdirSync(directory), ["confirm.wav"]);
  assert.throws(() => generateInterfaceSounds(root, true), /missing_sound_output/u);
});

test("read-only checks do not create missing output directories", () => {
  const root = fixture();
  const directory = path.join(root, "mobile/app/assets/sounds");
  assert.throws(() => generateInterfaceSounds(root, true), /missing_sound_directory/u);
  assert.equal(fs.existsSync(directory), false);
  assert.throws(() => generateInterfaceSounds(root, "write"), /invalid_mode/u);
  assert.throws(() => generateInterfaceSounds("/"), /invalid_root/u);
  assert.throws(() => generateInterfaceSounds("relative"), /invalid_root/u);
});

test("rejects linked sound directories and linked or hardlinked outputs", () => {
  const linked = fixture();
  const target = fixture();
  fs.symlinkSync(
    path.join(target, "mobile/app/assets"),
    path.join(linked, "mobile/app/assets/sounds"),
  );
  assert.throws(() => generateInterfaceSounds(linked), /linked_sound_directory/u);
  for (const kind of ["symlink", "hardlink"]) {
    const root = fixture();
    const directory = path.join(root, "mobile/app/assets/sounds");
    fs.mkdirSync(directory);
    const source = path.join(root, "retained-input.wav");
    fs.writeFileSync(source, synthesizeSound("tap"), { flag: "wx" });
    const output = path.join(directory, "tap.wav");
    if (kind === "symlink") fs.symlinkSync(source, output);
    else fs.linkSync(source, output);
    assert.throws(() => generateInterfaceSounds(root), /nonregular_sound_output/u);
    assert.deepEqual(fs.readFileSync(source), synthesizeSound("tap"));
  }
});
