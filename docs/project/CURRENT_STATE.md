# Current state

- Local branch `codex/security-hardening` hardens external URLs, bounded/cancellable
  lookups, provider amplification, API origins/Host/quotas/timeouts and private logs.
  Deletion invalidates old lookup work; local storage is schema/size validated.
  Native config closes production cleartext/ATS exceptions, backup and unused OTA.
  Web exports add restrictive CSP/headers; Zod runs without eval/JIT. Web builds
  use identical explicit environment configuration for JavaScript and headers.
  Six dependency version corrections reduce the unchanged audit from 22 findings
  to zero. Weekly scheduled auditing uses that same policy, not exemptions.
  See ../security.md for findings, primary research, reproductions and release gates.
  These are local changes, not installed binaries, new GitHub CI or a production GO.
  Current validation: 2,165 tests; all scoped gates and all-platform JS exports;
  Doctor 20/20; 4 actual-CSP, 8 real-model and 8 FI/EN fixture cases plus Overview
  deletion/persistence regression pass. Production native config introspection passes.
- Local source `63e6949` adds a single-first confirmation:
  Yes enters material questions; No reveals the next three ranked supported
  objects plus None. Weak/close ranks show choices immediately; unknown/multiple
  retain retake/guide recovery. Native and server share the display-only policy.
  No model weights, accuracy claim, sorting rules, phone install or push changed.
  Expanded server JSON is opt-in; legacy clients retain their three-item v1 shape.
  Eight actual-model Chrome cases and eight FI/EN fixture UI scenarios pass;
  Overview FI/EN recording/correction/privacy regression also passes.
  Final validate: 2,111 tests, types, lint, boundaries and builds pass; scoped
  mobile/backend/shared gates and all-platform JS export also pass. Upstream
  Rdotcom HSY parsing changes (`07fc735`, PR #47) are retained byte-unchanged.
- The app retains mobile/backend/shared boundaries. Native image inference is
  on-device; Expo Go/browser suggestions use explicit own-computer server consent.
- Owner-requested OpenAI retirement removes its provider, API routes/configuration,
  UI entry, FI/EN text, contracts and paid-only QA tools. Old /photo bookmarks
  redirect to /local-photo; old paid HTTP endpoints are absent, not a fallback.
  Shared image sanitization and native camera guards remain independent.
  Removal source `f0b3349` is published in KierratysAppi/main; no native reinstall.
  Follow-up `7022f66` passes CI 44187544355, Security 44187544303 and Windows
  44187891912, including actual-model Chrome/Edge and all-platform JS exports.
- Owner authorized main publication on 2026-11-17. KierratysAppi/main now contains
  tested migration `ec1e137` (code `774ad41`); no private experiment ancestry was shared.
- Picomatch and Micromatch are genuinely absent from the installed graph.
  Eight pinned tool callers use an original bounded Minimatch 11 adapter.
  Historical migration audit passed with 22 lower findings; current local audit is zero.
- GitHub CI 44177999529 and Security 44177999523 pass. Windows 44178058438
  passes real glob/tool contracts, frozen model parity, all-platform JS exports
  and actual Chrome/Edge consent/image/guidance/offline flows.
- OpenAI-retirement baseline: 2,093 tests, typechecking/builds, Expo Doctor 20/20,
  all-platform JS exports and eight actual-model Chrome cases pass. Models,
  sorting data and persisted recycling records are unchanged by provider removal.
  Independent FI/EN Overview browser checks also pass after migrating photo
  fixtures to the free protocol, including material correction without duplicates.
- Native iPhone build 23 is unchanged. Physical Samsung, general recognition
  accuracy, memory/energy and store/production readiness are not certified.
- Eleven concise docs and 38 byte-pinned QA protocols remain. Historical archive
  is preserved in KeepItGreen `21e27aa`; no KeepItGreen app changes were pushed.
- Previous main delivery was owner-authorized; this security task authorizes no
  push, installation or public deployment. KeepItGreen and phone are unchanged.
  Evidence: ../testing.md.
