# Decisions

- 2026-11-18 security: model phone/app/backend/build trust boundaries against MASVS
  and primary Apple/Android/Expo guidance; do not promise absolute safety.
  Require reviewed HTTPS external destinations, bounded runtime-validated data,
  explicit private-HTTP lab opt-in and production native transport restrictions.
  Keep CORS/Host defences separate from authentication; public image service stays
  disabled. Use CSP hashes and Zod jitless, not unsafe-eval. Disable unused OTA.
  Serialize privacy deletion and invalidate/cancel pre-deletion lookups. Correct
  actual vulnerable dependencies without audit exceptions; schedule unchanged audit.
  Export web JS/headers from identical explicit env, without implicit dotenv reads.
  Native binaries, TLS hosting, Python transitive chain and independent testing
  remain separate evidence gates. No publication/install authority inferred.
- 2026-11-18: owner requests one object suggestion, alternatives only after No,
  except unclear inference. Use a versioned UI heuristic (cosine >= 0.12 and
  lead >= 0.04 over every runner-up); this is NOT calibrated accuracy/confidence.
  Keep user confirmation, material questions and all provenance. Retain four
  supported ranks internally; show at most three alternatives without repeating
  a rejected primary. Unknown/multiple do not force a sorting choice. Accept-based
  v2 representation is opt-in; application/json v1 remains unchanged. Rejection
  is transient UI state, not training/analytics. No push/install authorized here.
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
- 2026-11-17: owner explicitly authorizes pushing the tested corrections to
  KierratysAppi/main. Fast-forward the verified public-parent-only migration;
  do not force-push, change KeepItGreen or infer device-installation authority.
- 2026-11-17: owner requests removal of the separate paid OpenAI recognition
  feature and publication to KierratysAppi. Remove executable provider/routes,
  environment switches, obsolete contracts/copy and billable QA commands.
  Preserve /photo as a redirect, not a second recognition implementation.
  Native/Go/browser free paths, consent, image bounds, camera guards, stored
  records and required third-party notices remain. Do not read/revoke stored keys.
