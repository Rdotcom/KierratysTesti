# Decisions

- Maintain three source boundaries: mobile, backend and shared, using public exports.
- Treat image output as unverified suggestions; the user confirms object/material.
  Native inference is local; Go/browser uses explicit own-server photo consent.
- Preserve source licences, uncertainty and regional scope, including missing data.
- Replace picomatch/Micromatch through real source/import/manifest migrations,
  never by advisory suppression or fictitious upstream versions.
- 2026-11-17: owner authorizes archive/cleanup of KierratysAppi for a clear source
  repository. KeepItGreen/main `21e27aa` archives 533 original tracked docs/scripts/root
  notes from `2148d4e`, SHA-256
  `6718b94a7c6914fcd46e7be57c71f9a092bb0102b85dd5ff32b4cb1685a1ffdc`.
  Archive verified before removal; KeepItGreen app source unchanged. Preserve
  runtime/tests/licences and test-input bytes; do not rewrite Git history.
- 2026-11-17: owner authorizes codex/minimatch-migration publication and GitHub
  CI/Windows tests only, not a main merge. Original bounded adapter uses
  Minimatch 11; eight source patches and a version-scoped manifest hook remove
  obsolete implementation dependencies. Keep audit policy byte-identical.
  Vite retains its authoritative asset and fs.deny predicates without a regexp
  prefilter. Explicit noextglob/noglobstar switches do not retain old regexp
  fast-path exceptions; actual app configuration and default-contract parity pass.
- Validate the public-parent-only test source before any main decision; GitHub
  CI/Security/Windows evidence is recorded without changing the audit policy.
