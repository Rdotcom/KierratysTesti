"use strict";

// Manifest changes accompany the reviewed source patches in patches/. This
// removes unused implementations, not advisories. Never change audit results.
const migrations = new Map([
  ["@expo/cli", "58.1.21"],
  ["@expo/metro-config", "58.0.23"],
  ["vite", "8.3.5"],
  ["vitest", "4.1.12"],
  ["tinyglobby", "0.2.17"],
  ["fdir", "6.5.0"],
  ["jest-util", "29.7.0"],
  ["metro-file-map", "0.87.1"],
]);

function readPackage(pkg) {
  if (!migrations.has(pkg.name) || migrations.get(pkg.name) !== pkg.version) return pkg;
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "peerDependenciesMeta",
  ]) {
    if (!pkg[field]) continue;
    delete pkg[field].picomatch;
    if (pkg.name === "metro-file-map") delete pkg[field].micromatch;
  }
  pkg.dependencies = {
    ...pkg.dependencies,
    "@keepitgreen/build-glob": "workspace:*",
  };
  return pkg;
}
module.exports = { hooks: { readPackage } };
