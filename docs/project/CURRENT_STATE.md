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
- Picomatch has tested local patches but raw audit still reports
  GHSA-fc5q-39xc-vjpf/high. Public production remains NO-GO. See ../security.md.
- Current cleanup validation and publication evidence: ../testing.md.
