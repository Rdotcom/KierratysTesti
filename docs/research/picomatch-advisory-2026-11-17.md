# Picomatch security revalidation — November 17, 2026

## Follow-up: local mitigation, not a fixed upstream release

The owner asks for a feasible repair. Absence of an official release does not
mean a local mitigation is impossible. The original repair request did not
authorize publication; subsequent explicit main delivery is in TEST_EVIDENCE.md.
Primary upstream sources reviewed on 2026-11-17:

- https://github.com/micromatch/picomatch/pull/237 — open/unmerged, head
  `1bf0d04563cb9ce568cf36efc5f6b7187d9911d5`.
- https://github.com/micromatch/picomatch/pull/246 — open/unmerged, head
  `f03bec2c02e46f063fbfdc161aae1d0f854b2565`.
- https://raw.githubusercontent.com/micromatch/picomatch/master/lib/parse.js —
  master `9fab7bf61913ea334c4203ed321c426cfde44a42` still lacks this correction.
- https://github.com/micromatch/picomatch/pull/194 — the advisory reference is a
  different leading-question-mark change, not this repeated-star fix.

All original versions exceed a local700ms subprocess deadline on `+(*a)` against
32`a` characters and a final`b`. A broader original4.0.7probe times out12/18cases;
conservative PR246still times out6/18 (`?`, positive-class and repeated-star
variants, default/capture). Neither proposal is accepted solely on its claims.

Add hash-pinned pnpm patches for2.3.2/4.0.5/4.0.7. Simple separator-free branches
with a wildcard absorb repeated concatenations: collapse outer plus repetition,
replace outer star with optionality. Distinguish quoted/escaped/bracket literal
stars and extglob operators. Preserve existing nested-star protections. Newly
guarded advanced/capture forms use existing literal fallback, an intentional
compatibility limit. Unmatched brackets return conservatively without repeated
suffix rescanning. The upstream `maxExtglobRecursion: false` explicit opt-out is
not certified; application source has no caller enabling it. See patches/README.md
for boundaries, provenance and MIT notice. No package/version disguises.

Final probes:585adverse matches over3versions/5settings/3lengths, plus malformed
class compilation; all finish within bounded subprocess deadlines. Original and
patched upstream tag assertions pass1972/1977/1983tests, no exclusions/skips,
through a Node BDD loader against the actual installed parser. This is not a
claim to have run original Mocha CI. Short differential comparisons total
1,124,928, zero mismatches; not universal equivalence or all-ReDoS certification.

Reproduce after reviewing downloaded upstream test sources:

```sh
pnpm install --frozen-lockfile
node --test scripts/__tests__/picomatch-hardening.test.mjs
mkdir -p work/picomatch-review
git clone --depth 1 --branch 2.3.2 https://github.com/micromatch/picomatch.git work/picomatch-review/upstream-v2
git clone --depth 1 --branch 4.0.5 https://github.com/micromatch/picomatch.git work/picomatch-review/upstream-v405
git clone --depth 1 --branch 4.0.7 https://github.com/micromatch/picomatch.git work/picomatch-review/upstream-v4
node scripts/qa/picomatch-differential.mjs work/picomatch-review
PICOMATCH_QA_VERSION=4.0.7 PICOMATCH_QA_SOURCE=work/picomatch-review/upstream-v4 node --test --test-concurrency=1 --test-timeout=120000 scripts/qa/picomatch-upstream.cjs
```

Repeat the final command for4.0.5/upstream-v405and2.3.2/upstream-v2;
`PICOMATCH_QA_BASELINE=true` selects original assertions. PowerShell uses `$env:`
assignments instead of inline POSIX syntax. Reviewed tag commits:
2.3.2 `81cba8d4b767cab3cb29d26eb4f691eed75b73b2`,
4.0.5 `4f41a8edade7a5ab19832f7b40ecce46b288767f`,
4.0.7 `6bb40679c218cefba5d4e9662408c5fdf699a8bb`.

Receipts: work/picomatch-hardening-20261117.PAs54Q, summarized in TEST_EVIDENCE.md.
The unchanged raw audit still fails this **high** advisory: no official release
or audit waiver. Other lower-severity monitored advisories remain visible and
are not repaired by this focused change. Supported-release closure and production
NO-GO remain. No new phone install; subsequent authorized source delivery is
recorded in TEST_EVIDENCE.md.

## Initial published-version investigation (historical)

Primary sources, accessed November17:

- https://github.com/advisories/GHSA-fc5q-39xc-vjpf
  Reviewed high-severity CVE-2026-112366, updated November17. Affected versions
  through4.0.7; patched versions listed as None. Repeated single-branch extglobs
  can cause regular-expression denial of service. Keep high severity unchanged.
- https://registry.npmjs.org/picomatch/latest
  Independent `npm view picomatch version versions --json` reports latest4.0.7;
  registry receipt retained in the installation run. No published fixed version
  is identified. Do not guess that another affected branch fixes this issue.

Actual `pnpm security:audit` now fails on this advisory, whereas the earlier
November17audit passed before this updated report. `pnpm -r why picomatch`
finds three versions in the dependency graph, including Expo/Metro/Vite tooling.
Runtime/external-input reachability is not established by that graph; do not
assert the app exploitable or safe from it without further evidence.

Run: work/ios-go-parity-client23-20261117.Jc49XI. Receipts: security-audit.log,
picomatch-why.log, picomatch-registry.json. No audit exclusion, severity downgrade,
package rename/version disguise or unreviewed fork introduced. Supported-upstream
remediation is blocked pending a fixed release. Source sharing/native installation
does not grant a production GO or change the repository's failing audit gate.
