# Picomatch local security hardening

Review date: 2026-11-17. Advisory: [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), CVE-2026-112366, **high**.

The registry currently has no fixed release (latest 4.0.7). These are local
`pnpm patch` changes, **not** an upstream-approved release or a complete security
certification. Package versions/integrities remain truthful. The unchanged audit
policy still fails this advisory; do not add an exception or claim production GO.

## Origin and scope

- Original MIT picomatch parser: tags 2.3.2, 4.0.5 and 4.0.7.
- Based on the single-branch repeated-wildcard analysis and quantifier-collapse
  idea in unmerged [PR 246](https://github.com/micromatch/picomatch/pull/246),
  head `f03bec2c02e46f063fbfdc161aae1d0f854b2565`, and
  [PR 237](https://github.com/micromatch/picomatch/pull/237),
  head `1bf0d04563cb9ce568cf36efc5f6b7187d9911d5`.
- Local additions distinguish wildcard from quoted/escaped/bracket literal
  stars and extglob operators. Simple separator-free branches with a real star
  lose the ambiguous outer repetition. Positive ASCII member classes, `?` and
  within-segment repeated stars are included because narrower PR 246 still
  times out on these variants. Existing nested-star handling is retained.
- New advanced-star forms (paths, nested expressions, complex classes, escaped
  components) and `capture: true` use the parser's existing **literal fallback**.
  This intentionally changes matching for those forms, rather than emit a
  potentially unsafe expression or claim preservation of repeated captures.
- The upstream `maxExtglobRecursion: false` explicit security opt-out remains
  an opt-out. This mitigation does not certify that mode, arbitrary regex
  expressions, all other ReDoS families, or unbounded attacker-controlled input.
  No application caller introduces that option. Do not use it for untrusted globs.

All three patches change only `lib/parse.js`. The application, model, native
binaries and sorting data are unchanged. A running Node process must restart to
discard its old loaded parser. A frozen install applies the patches automatically;
never repair `node_modules` manually or rewrite published package versions.
Git attributes keep patch files LF-stable on Windows, preserving pnpm SHA-256
values even when the developer uses core.autocrlf.

## Verification and retirement

`node --test scripts/__tests__/picomatch-hardening.test.mjs` checks patch hashes,
all locked runtime edges, actual Expo/Metro/Vite/tinyglobby/micromatch resolution,
ordinary matching, capture/literal fallback and 585 adverse matches in bounded subprocesses.
The child probes have heap/output/deadline bounds; they do not attack a service.

See [security status and boundaries](../docs/security.md)
and [test evidence](../docs/testing.md) for original-versus-patched
measurements, upstream compatibility suites, intentional limits and run receipts.

When a supported fixed release is available, review it against the advisory,
update every dependency line, remove only superseded patch mappings/files with
pnpm, and retain the regression suite adapted to the fixed versions. Repeat frozen
install, raw audit, full validation, Expo health and all-platform JS exports.
Only an actual clean audit and remaining release requirements can clear NO-GO.

Original MIT copyright/permission notice: [picomatch-MIT.txt](picomatch-MIT.txt).
Installed package LICENSE files are not modified.
