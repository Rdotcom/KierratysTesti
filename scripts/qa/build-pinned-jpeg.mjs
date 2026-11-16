import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const revision = "7b4993786d856cbccabfc0ed2f923ba000e326cc";
const archive = path.join(run, "jpeg-source-7b499.tar.gz");
assert.equal(
  createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),
  "e10ff4ce2943a9021f9b0398fe00029915dd4eaf32c7560e36305341ec826735",
);
const source = path.join(run, `libjpeg-turbo-${revision}`);
assert(fs.realpathSync(source) === source);
const xcode = "/Applications/Xcode.app/Contents/Developer";
const artifacts = [];
for (const platform of ["macos", "iphoneos", "iphonesimulator"]) {
  const sdkName = platform === "macos" ? "macosx" : platform;
  const sdk = execFileSync("/usr/bin/xcrun", ["--sdk", sdkName, "--show-sdk-path"], {
    env: { ...process.env, DEVELOPER_DIR: xcode },
    encoding: "utf8",
  }).trim();
  const build = path.join(run, `jpeg-v2-${platform}`);
  assert(!fs.existsSync(build), "never_overwrite_build");
  const args = [
    "-S",
    source,
    "-B",
    build,
    "-DENABLE_SHARED=OFF",
    "-DENABLE_STATIC=ON",
    "-DWITH_SIMD=OFF",
    "-DWITH_TOOLS=OFF",
    "-DWITH_TESTS=OFF",
    "-DCMAKE_BUILD_TYPE=Release",
    "-DCMAKE_OSX_ARCHITECTURES=arm64",
    "-DCMAKE_SYSTEM_PROCESSOR=arm64",
    `-DCMAKE_OSX_SYSROOT=${sdk}`,
    `-DCMAKE_OSX_DEPLOYMENT_TARGET=${platform === "macos" ? "15.0" : "16.4"}`,
  ];
  if (platform !== "macos") args.push("-DCMAKE_SYSTEM_NAME=iOS");
  const log = fs.openSync(path.join(run, `jpeg-v2-${platform}-build.log`), "wx");
  try {
    execFileSync("cmake", args, {
      stdio: ["ignore", log, log],
      env: { ...process.env, DEVELOPER_DIR: xcode },
    });
    execFileSync("cmake", ["--build", build, "--target", "turbojpeg-static", "--parallel", "2"], {
      stdio: ["ignore", log, log],
      timeout: 300000,
    });
  } finally {
    fs.closeSync(log);
  }
  const library = path.join(build, "libturbojpeg.a");
  assert(fs.statSync(library).size > 100000 && fs.statSync(library).size < 10000000);
  artifacts.push({
    platform,
    file: path.relative(root, library),
    sha256: createHash("sha256").update(fs.readFileSync(library)).digest("hex"),
  });
}
const target = path.join(root, "mobile/app/modules/local-vision/ios/JpegDecoderAssets");
assert(!fs.existsSync(target), "never_overwrite_staged_decoder");
fs.mkdirSync(target);
const include = path.join(target, "include");
fs.mkdirSync(include);
fs.copyFileSync(
  path.join(source, "src/turbojpeg.h"),
  path.join(include, "turbojpeg.h"),
  fs.constants.COPYFILE_EXCL,
);
execFileSync(
  `${xcode}/usr/bin/xcodebuild`,
  [
    "-create-xcframework",
    "-library",
    path.join(run, "jpeg-v2-iphoneos/libturbojpeg.a"),
    "-headers",
    include,
    "-library",
    path.join(run, "jpeg-v2-iphonesimulator/libturbojpeg.a"),
    "-headers",
    include,
    "-output",
    path.join(target, "TurboJPEG.xcframework"),
  ],
  { stdio: "pipe" },
);
for (const name of ["LICENSE.md", "README.ijg"])
  fs.copyFileSync(path.join(source, name), path.join(target, name), fs.constants.COPYFILE_EXCL);
fs.writeFileSync(
  path.join(target, "receipt.json"),
  JSON.stringify(
    { version: "3.2.1", revision, simd: false, tools: false, testsBuilt: false, artifacts },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(
  "Pinned decoder built for macOS/iPhone/simulator, no model inference; library tests not yet executed.",
);
