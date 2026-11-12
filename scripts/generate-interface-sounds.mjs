import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Original deterministic PCM synthesis, no recording, sample library or network.
export const SOUND_SAMPLE_RATE = 22_050;
const specification = (durationMs, gain, notes) =>
  Object.freeze({
    durationMs,
    gain,
    notes: Object.freeze(notes.map((note) => Object.freeze(note))),
  });
export const SOUND_SPEC = Object.freeze({
  tap: specification(35, 0.14, [[0, 35, 860]]),
  ready: specification(140, 0.16, [
    [0, 60, 620],
    [70, 70, 825],
  ]),
  confirm: specification(200, 0.17, [
    [0, 80, 660],
    [90, 110, 880],
  ]),
  attention: specification(120, 0.14, [
    [0, 50, 390],
    [60, 60, 315],
  ]),
});
export const SOUND_NAMES = Object.freeze(Object.keys(SOUND_SPEC));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

export function synthesizeSound(name) {
  assert.ok(SOUND_NAMES.includes(name), "unknown_sound");
  const spec = SOUND_SPEC[name];
  const samples = Math.round((SOUND_SAMPLE_RATE * spec.durationMs) / 1000);
  const pcm = new Int16Array(samples);
  for (const [startMs, lengthMs, targetFrequency] of spec.notes) {
    const start = Math.round((SOUND_SAMPLE_RATE * startMs) / 1000);
    const count = Math.min(Math.round((SOUND_SAMPLE_RATE * lengthMs) / 1000), samples - start);
    const cycles = Math.max(1, Math.round((targetFrequency * (count - 1)) / SOUND_SAMPLE_RATE));
    // Integer cycles, a symmetric Hann envelope and antisymmetric quantization
    // give exact zero DC and zero endpoints without a hard edge or metadata.
    for (let i = 0; i < Math.floor(count / 2); i++) {
      const t = i / (count - 1);
      const envelope = Math.sin(Math.PI * t) ** 2;
      const phase = 2 * Math.PI * cycles * t;
      const wave = Math.sin(phase) * 0.8 + Math.sin(2 * phase) * 0.12 + Math.sin(3 * phase) * 0.04;
      const value = Math.round(32_767 * spec.gain * envelope * wave);
      pcm[start + i] = value;
      pcm[start + count - 1 - i] = -value;
    }
  }
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SOUND_SAMPLE_RATE, 24);
  wav.writeUInt32LE(SOUND_SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(pcm[i], 44 + i * 2);
  return wav;
}

/** Create known outputs exclusively; existing byte-identical assets are left
 * alone and unknown/mismatched files are never overwritten, even in write mode.
 */
export function generateInterfaceSounds(root = repositoryRoot, check = false) {
  assert.equal(typeof check, "boolean", "invalid_mode");
  assert.ok(path.isAbsolute(root) && root !== path.parse(root).root, "invalid_root");
  assert.equal(fs.realpathSync(root), root, "linked_root");
  const assets = path.join(root, "mobile/app/assets");
  assert.equal(fs.realpathSync(assets), assets, "linked_assets");
  assert.ok(fs.lstatSync(assets).isDirectory(), "invalid_assets");
  const directory = path.join(assets, "sounds");
  const directoryInfo = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (directoryInfo) {
    assert.ok(
      directoryInfo.isDirectory() && !directoryInfo.isSymbolicLink(),
      "linked_sound_directory",
    );
    assert.equal(fs.realpathSync(directory), directory, "linked_sound_directory");
  } else assert.equal(check, false, "missing_sound_directory");
  const outputs = SOUND_NAMES.map((name) => {
    const file = path.join(directory, `${name}.wav`);
    assert.equal(path.dirname(file), directory);
    const bytes = synthesizeSound(name);
    const info = fs.lstatSync(file, { throwIfNoEntry: false });
    if (info) {
      assert.ok(
        info.isFile() && !info.isSymbolicLink() && info.nlink === 1,
        "nonregular_sound_output",
      );
      assert.equal(fs.realpathSync(file), file, "linked_sound_output");
      assert.equal(info.size, bytes.length, "existing_sound_differs");
      assert.deepEqual(fs.readFileSync(file), bytes, "existing_sound_differs");
    } else assert.equal(check, false, "missing_sound_output");
    return { name, file, bytes, exists: Boolean(info) };
  });
  if (!directoryInfo) fs.mkdirSync(directory, { mode: 0o755 });
  assert.equal(fs.realpathSync(directory), directory);
  for (const output of outputs) {
    if (output.exists) continue;
    const fd = fs.openSync(
      output.file,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        (fs.constants.O_NOFOLLOW ?? 0),
      0o644,
    );
    try {
      const stat = fs.fstatSync(fd);
      assert.ok(stat.isFile() && stat.nlink === 1 && stat.size === 0, "invalid_new_sound_output");
      fs.writeFileSync(fd, output.bytes);
    } finally {
      fs.closeSync(fd);
    }
  }
  return outputs.map(({ name, bytes }) => ({
    name,
    bytes: bytes.length,
    durationMs: SOUND_SPEC[name].durationMs,
    sha256: sha(bytes),
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(
    args.length === 0 || (args.length === 1 && args[0] === "--check"),
    "Use no arguments or --check",
  );
  console.log(
    JSON.stringify(generateInterfaceSounds(repositoryRoot, args[0] === "--check"), null, 2),
  );
}
