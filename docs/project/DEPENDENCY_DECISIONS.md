# Dependency decisions

## November16 — bounded deterministic JPEG input for optional SigLIP2

libjpeg-turbo3.2.1 official tag commit7b4993786d856cbccabfc0ed2f923ba000e326cc,
codeload archive SHA256e10ff4ce2943a9021f9b0398fe00029915dd4eaf32c7560e36305341ec826735.
Source/header/licence read against current official upstream. Static scalar
accurate-integer-IDCT/smooth-upsample builds, own bounded memory-only C adapter;
reject warnings,8MP/4096axes/8MB,32MBintermediates/100scans,8-bit RGB/gray/YCbCr.
No stb_image integration; no source changes to upstream JPEG algorithms.
IJG+BSD full notices ship separately and acknowledgement appears in Legal.
No NPM package upgrade/root lock change; only local podspec checksum/new static
XCFramework integration. macOS/iPhone/ARM64-simulator library compilation is not
Samsung/x86simulator evidence. NativeC1929checks/ASan+UBSan500malformed inputs
pass; no claim of formal parser safety. Actual4JPEG phone/Mac tensors and scores
now agree exactly with unchanged rank/score gates. Model/prototype/legacy pins
preserved. Clean-checkout model asset delivery and broader release gates remain.

No production dependency is accepted solely from memory. Versions are pinned after checking current official compatibility and package metadata. Latest package compatibility check: 2026-09-10. Latest toolchain/physical startup check: 2026-09-08 (older dependency set).

September 10 current set: Expo **57.0.21**, Router **57.0.20**, unchanged RN **0.86.3** / dev-client **57.0.18**. GitHub Doctor first failed 19/20 on the previous Expo/Router patches; the minimum SDK-compatible update now passes frozen install, peers, install check, Doctor 20/20 and full **188-test** validation. Expo/Router were published September 8 at 13:50:37.144 / 13:48:35.933 UTC (over 42 hours before selection). Narrow `pnpm -r update @xmldom/xmldom js-yaml --depth Infinity` retains parent ranges and selects xmldom 0.8.15/0.9.12 and js-yaml 4.3.2, published August 21/26. No exclusions, overrides, new direct parser dependencies or toolchain major migration. Live security policy passes after closing 20 high records; six moderate and one low remain documented. The physical/native acceptance described below belongs to the older set; regenerate native files and rebuild/install before claiming the new set works on-device.

Toolchain follow-up 2026-09-08: Xcode 27 beta 6 compiled/signed/installed the unchanged Expo set, but the app immediately trapped because its generated AppDelegate has no UIScene lifecycle. Xcode 27 SDK application builds are **not accepted**. The restored Xcode 26.6 artifact passes Home/manual/Nutella/provenance and terminate/relaunch. Native dev-client and dev-menu are 57.0.18; dev-launcher is 57.0.19. No dependency change was made. See D-021 and `docs/final/XCODE_27_VALIDATION.md` for the required local migration and dated evidence.

| Area | Candidate | Decision | Reason / gate |
| --- | --- | --- | --- |
| Package manager | pnpm 11 workspace | Accepted | Installed locally; deterministic workspace support; pin via `packageManager` and Corepack-compatible CI. |
| Runtime | Node 24 LTS | Accepted | Expo recommends LTS and Node marks v24 LTS; local Node 26 is Current. |
| Mobile | Installed: Expo 57.0.19, React Native 0.86.3, React 19.2.3, Expo Router 57.0.18, expo-dev-client 57.0.18 | Compatibility/build/install accepted on 2026-09-04; limited physical runtime accepted on 2026-09-07 | Frozen install, peers, Expo install check and Doctor 1.20.1 20/20 pass without age/exclusion bypass. The fresh native build, strict signatures, install and client launcher pass. Current LAN/API/Metro health, phone-to-Metro TCP, Home, manual entry and a known-product result with uncertainty/Rinki provenance also pass. The old Expo 57.0.16/RN 0.86.2 client's broader flow evidence remains historical. |
| Camera | expo-camera 57.0.4 | Accepted | Official SDK camera/barcode and permission API; physical behavior remains a device gate. |
| API | Fastify 5.11.x | Accepted | Small, schema-oriented TypeScript boundary; framework-independent domain/services. |
| Validation | Zod 4.4.x | Accepted | Shared runtime schemas for external JSON, API contracts, and mobile; no `any` at provider boundary. |
| Database | PostgreSQL migrations with repository interfaces | Accepted | Preserve production schema without requiring Docker for deterministic vertical-slice tests. |
| Testing | Vitest 4.1.x; RN testing library after Expo-compatible configuration | Accepted | Domain/contract/integration coverage first; use template-compatible TypeScript rather than latest TS 7. |
| OCR | on-device/native option | Deferred | Compare privacy, platform, and Expo compatibility before adding. |

Package patch versions are locked by `pnpm-lock.yaml`. The workspace explicitly enforces `minimumReleaseAge: 1440` with strict mode for direct and transitive resolution. Expo-native versions are installed with `expo install`, then checked with frozen install, Expo dependency validation, Doctor and full validation; no age exclusion is configured. The accepted September set also includes constants 57.0.17, font 57.0.3, haptics 57.0.2, linking 57.0.9 and system-ui 57.0.3. Every native dependency change requires a fresh native build/install and runtime smoke; OWNER_ACTIONS OA-11 describes the recurring gate.

The September dependency refresh removes the old Metro `image-size` path (current Metro 0.84.5), so the two historical high-advisory exceptions are obsolete rather than extended. Newly detected `fast-uri` high advisories require the patched 3.1.7/4.1.4 lockfile resolutions and regression-tested security floors; no high/critical advisory is accepted by the current policy. See AUD-028/AUD-041 and `docs/security/DEPENDENCY_RISK_ACCEPTANCE.md` for dated evidence.

The September 7 startup smoke closed the temporary phone-to-Mac development-connectivity blocker. The first known-product lookup correctly entered the offline state because the already-running Metro bundle still contained the prior API LAN address. Restarting Metro with the current `EXPO_PUBLIC_API_BASE_URL` restored lookup without a code or dependency change. Future LAN development runs must verify both current Metro and API origins before runtime acceptance.

September 4 full validation passes 167 tests (154 application, 13 policy), all source/build checks and the web export; coverage also passes. A captured post-update raw dependency audit reports zero high/critical records, six moderate and one low. The final live audit-policy rerun fails closed after 60 seconds because the external npm audit endpoint is unresponsive; this remains an explicit release-validation blocker until the dependency/security owner reruns `corepack pnpm security:audit` successfully. The snapshot is not a substitute for that final command.
