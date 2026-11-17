# Current state

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
  Raw audit passes the unchanged high/critical policy; 22 lower findings remain visible.
- GitHub CI 44177999529 and Security 44177999523 pass. Windows 44178058438
  passes real glob/tool contracts, frozen model parity, all-platform JS exports
  and actual Chrome/Edge consent/image/guidance/offline flows.
- Current local validation: 2,093 tests, typechecking/builds, Expo Doctor 20/20,
  all-platform JS exports and eight actual-model Chrome cases pass. Models,
  sorting data and persisted recycling records are unchanged by provider removal.
  Independent FI/EN Overview browser checks also pass after migrating photo
  fixtures to the free protocol, including material correction without duplicates.
- Native iPhone build 23 is unchanged. Physical Samsung, general recognition
  accuracy, memory/energy and store/production readiness are not certified.
- Eleven concise docs and 38 byte-pinned QA protocols remain. Historical archive
  is preserved in KeepItGreen `21e27aa`; no KeepItGreen app changes were pushed.
- Main delivery is owner-authorized; KeepItGreen and phone installation are unchanged.
  Evidence: ../testing.md.
