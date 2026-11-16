// Mechanical native-icon compilation from the selected imagegen cutout.
// No network, image generation, credentials or application runtime dependency.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const root = fs.realpathSync(process.cwd()),
  dir = path.join(root, "mobile/app/assets/brand");
assert.equal(fs.realpathSync(dir), dir);
const require = createRequire(import.meta.url),
  modulePath = process.env.SHARP_MODULE_PATH;
assert(modulePath && path.isAbsolute(modulePath), "set_installed_SHARP_MODULE_PATH");
const sharp = require(modulePath),
  source = fs.readFileSync(path.join(dir, "leaf-mark-v1.png"));
const hash = (v) => createHash("sha256").update(v).digest("hex");
assert.equal(
  hash(source),
  "bb137dfe7cd1e1a4062a52acf2ae19e167ad44d3b0da1751ea7c28274dcd08b0",
  "selected_cutout_pin",
);
const args = process.argv.slice(2),
  check = args.length === 1 && args[0] === "--check";
const replace = args.length === 1 && args[0] === "--write";
assert(args.length === 0 || check || replace, "use_no_args_or_check_or_write");
const metadata = await sharp(source).metadata();
assert.equal(metadata.width, 1254);
assert.equal(metadata.height, 1254);
assert.equal(metadata.hasAlpha, true);
const background = "#F4FAF5";
const mark = await sharp(source).trim().png().toBuffer();
async function contain(size, canvas = 1024) {
  const image = await sharp(mark)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: image, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
const full = await sharp(await contain(768))
  .flatten({ background })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toBuffer();
const foreground = await contain(480);
const { data: pixels, info } = await sharp(foreground).raw().toBuffer({ resolveWithObject: true });
assert.equal(info.channels, 4);
let visible = 0;
for (let y = 0; y < 1024; y++)
  for (let x = 0; x < 1024; x++) {
    const alpha = pixels[(y * 1024 + x) * 4 + 3];
    if (alpha > 0) {
      visible++;
      assert(Math.hypot(x - 511.5, y - 511.5) < 332, "adaptive_icon_safe_circle");
    }
  }
assert(visible > 50000, "nonempty_icon");
const mono = await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: "#000000" },
})
  .composite([{ input: foreground, blend: "dest-in" }])
  .png({ compressionLevel: 9 })
  .toBuffer();
const { data: monochrome } = await sharp(mono).raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < monochrome.length; i += 4) {
  assert.equal(monochrome[i], 0);
  assert.equal(monochrome[i + 1], 0);
  assert.equal(monochrome[i + 2], 0);
  assert.equal(monochrome[i + 3], pixels[i + 3], "same_monochrome_silhouette");
}
const assets = {
  "leaf-app-icon.png": full,
  "leaf-adaptive-foreground.png": foreground,
  "leaf-adaptive-monochrome.png": mono,
  "leaf-favicon.png": await sharp(full).resize(64, 64).png({ compressionLevel: 9 }).toBuffer(),
};
const outputs = [];
for (const [name, bytes] of Object.entries(assets)) {
  const file = path.join(dir, name),
    stat = fs.existsSync(file) ? fs.lstatSync(file) : null;
  assert(!stat || (stat.isFile() && !stat.isSymbolicLink()));
  if (check) assert.deepEqual(fs.readFileSync(file), bytes, `${name}_reproducible`);
  else {
    assert(!stat || replace, "refuse_existing_asset_use_check_or_write");
    fs.writeFileSync(file, bytes, { flag: stat ? "w" : "wx" });
  }
  const m = await sharp(bytes).metadata();
  outputs.push({
    name,
    width: m.width,
    height: m.height,
    alpha: m.hasAlpha,
    bytes: bytes.length,
    sha256: hash(bytes),
  });
}
console.log(JSON.stringify({ sourceSha256: hash(source), background, outputs }, null, 2));
