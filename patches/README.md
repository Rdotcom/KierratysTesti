# Nonrecursive build-glob migration

Reviewed 2026-11-17. Picomatch/Micromatch are removed from the installed graph,
not renamed or assigned a fictitious fixed version. The original adapter
in scripts/glob-adapter delegates matching to Minimatch 11.0.9's nonrecursive
engine. No picomatch parser, regexp compiler or lib/utils is retained.

## Source patches and dependency metadata

Pinned pnpm patches change imports in @expo/cli 58.1.21, @expo/metro-config
58.0.23, Vite 8.3.5, Vitest 4.1.12, tinyglobby 0.2.17, fdir 6.5.0,
jest-util 29.7.0 and metro-file-map 0.87.1. Their upstream versions,
registry integrities and installed licences remain unchanged.
The version-scoped .pnpmfile.cjs readPackage hook replaces their dependency
edges with the real @keepitgreen/build-glob workspace package.
It does not modify audit results or arbitrary packages. Future tool versions
require a new source review; an unreviewed picomatch edge fails regression tests.
pnpm records patch and hook checksums in the frozen lockfile.

Vite's optional resolveId regexp prefilter is removed. Its authoritative
assetsInclude/URL handler and fs.deny protection remain and are integration-tested.
No fake regexp/source object or match-everything substitute is used.

## Supported contract and bounds

The adapter implements the inspected consumers' boolean factory, arrays,
isMatch, some, negation state and path scan (base/parts/isGlob).
It handles dotfiles, nocase, basename, Windows input separators, braces,
extglobs, exclusions and zero-depth trailing /**. It is not an implementation
of every public picomatch API. Capture, contains and bash modes fail explicitly.
The noextglob/noglobstar switches follow literal/single-level semantics;
old picomatch regexp fast-path exceptions for these switches are not retained.
No application configuration depends on those exceptions.

Inputs, pattern count, syntax/nesting, brace expansion and path depth are bounded.
The linear lexer rejects excessive work before the third-party expander.
Tests retain the original repeated-extglob attack families, positive controls,
malformed input, real Expo/Jest/Metro/tinyglobby/fdir/Vite contracts and a
5,544-comparison frozen baseline. A separate 52,672-comparison repository-path
check passed. Neither bounded tests nor a clean advisory scan prove universal
algorithmic security or device/store readiness.

Run pnpm install --frozen-lockfile, pnpm validate, pnpm security:audit,
Expo Doctor and all-platform exports after a tool or adapter change.
The high/critical audit policy and its advisory regression tests are unchanged.
See [current evidence](../docs/testing.md) and [security boundaries](../docs/security.md).

Upstream tool source is MIT-licensed and its notices remain in installed packages.
Minimatch 11 and @isaacs/nonrecursive-glob-match use BlueOak-1.0.0:
https://blueoakcouncil.org/license/1.0.0.
The adapter is project-original code, not relicensed upstream picomatch code.
