# Current state

- App source is divided into mobile, backend and shared. Native image inference
  runs on-device; Expo Go/browser image suggestions use the own-computer server.
- Source before cleanup: KierratysAppi/main `2148d4e`. Native iPhone build 23 is unchanged.
  Cleanup validation passes 2,125 tests and all builds; real-model browser flow passes.
  Physical Samsung and general recognition accuracy are not certified.
- Owner requests a focused repository. Historical docs/scripts snapshot is
  preserved in KeepItGreen `21e27aa`; 533 files verified byte-for-byte.
  Current docs are condensed from 200 to 11 files; 38 test-input protocols move beside QA tools.
  App code, models, data, tests and security gates are preserved.
- Isolated codex/minimatch-migration replaces picomatch/Micromatch with a genuine
  bounded Minimatch 11 adapter in eight pinned build-tool consumers. Root audit
  now passes the unchanged high/critical policy; 22 lower findings stay visible.
  Production readiness is not established by this dependency fix.
- Current cleanup validation and publication evidence: ../testing.md.
- Cleanup published as KierratysAppi/main `2c63588`, public parent only. CI
  44162245767 passes parts/full/Expo, fails only known audit; Security 44162245784 passes.
- Migration local evidence: full validation/builds, frozen install, Expo Doctor
  20/20, iOS/Android/web JS exports and all six real-model Chrome cases pass.
  GitHub CI/Windows evidence is pending on the owner-authorized test branch.
  Main and the installed iPhone build are unchanged; see ../testing.md.
