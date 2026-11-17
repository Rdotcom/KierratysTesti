# Picomatch security revalidation — November 17, 2026

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
