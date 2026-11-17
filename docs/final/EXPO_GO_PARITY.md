# Expo Go presentation parity — November 17, 2026

The owner chooses stock Expo Go, not another development-build installation.
Use the same app-owned UI, real data and sorting components. Do not simulate a
working native library or describe server processing as on-device/offline work.
The initial UI-refactor unit did not push or replace installed iPhone22.
Subsequently authorized native23installation/source sharing is recorded below.

## Implemented

- Home and Identify now have identical runtime-independent actions and copy.
  An unconfigured recognizer opens its real setup/recovery screen rather than
  silently relabelling the AI action as a sorting-guide action.
- Native, Go and browser routes render the same RecognitionHeading,
  RecognitionStart, RecognitionPreview and RecognitionRecovery components.
  Keep existing palette, fonts, rounded controls, 300pt image preview and
  accessible labels. Browser adds its genuinely supported file-chooser action.
- The shared start screen has camera, material-code entry and the same manual
  barcode card. It uses the real expanded local-first session (199 bundled
  source identities, cache, appropriate online fallback), not the five-reference
  photo catalogue. Invalid input has an inline recovery. Blur/background clears
  transient manual text and suppresses late navigation.
- Native scope, privacy, material-photo camera and separate optional cloud
  entry remain in About recognition. No native inference functionality is
  removed. Go details explicitly distinguish its object-only server from native
  material-marking/OCR and exact-product evidence capabilities.
- Preview has the same Recognize/New picture controls. Go/web then display a
  separate per-photo confirmation with recipient, retention, HTTP warning and
  explicit Send photo and identify. Opening confirmation, cancelling it,
  capturing, choosing a file and navigating do not send an image. Background,
  new capture and blur clear consent and abort late work. No automatic retry.
- Object choices, material questions, sourced guidance and recycling actions
  continue through the existing shared result component. Provenance truthfully
  identifies local versus server inference; exact product/catalogue evidence is
  not fabricated for the object-only server.

## Library evidence, not a blanket physical-device certification

`expo install --check` reports current SDK58 alignment; Expo Doctor1.21.5 passes
20/20. No dependency/lockfile or native configuration changes in this unit.
Actual Android API35 ARM64 Go58.0.5 Hermes inspection finds initialized modules
for camera, file system, location, font, asset, constants, linking, splash,
status bar, Reanimated/Worklets, safe area, screens and AsyncStorage. The
otherwise unimported SystemUI and Gesture Handler native modules are also
present. This module evidence is deliberately distinct from exercising every
method or real physical permissions.

| Dependency family | What is verified here | Limit |
| --- | --- | --- |
| React19.3 / RN0.88.1 / Expo58.0.26 / Router58.0.32 | Actual Go screen/navigation startup, strict checks and shared controls | Host/runtime patches are not identical to the installed native binary |
| expo-camera58.0.14 | Go permission API and actual emulator camera capture/preview; browser uses a synthetic camera | Physical iPhone/Samsung optics, permissions and barcode decoding need their own evidence |
| expo-file-system58.0.14 | Actual Go cache file create/write/read/delete roundtrip, test file removed | Only temporary QA file; no private photo/cache enumeration |
| AsyncStorage2.2.0 | Actual Go unique QA-key write/read/remove; isolated browser recycling and settings | No owner history read; not a database recovery certification |
| expo-font58.0.12 / asset58.0.21 / IBM Plex Mono0.4.1 | Actual loaded code font and initialized native modules; visual screenshots | Atkinson0.4.1 is declared but not the current app's selected system-sans family |
| Reanimated4.7.1 / Worklets0.13.0 / Screens4.30.1 / Safe Area5.11.1 | Native initialization and navigation; browser reduced-motion QA | Not a physical battery/thermal or screen-reader certification |
| Gesture Handler3.3.0 / SystemUI58.0.7 | Native modules present in Go; currently no direct app import/use | Do not add artificial gestures or alter system appearance merely to claim a test |
| Location58.0.22 | Native foreground API present; browser location-intent/denial recovery | No private coordinates collected; real GPS/region accuracy not newly tested |
| Constants58.0.16 / Linking58.0.17 / Splash58.0.14 / Status Bar58.0.5 | Native modules initialized; real Go project link/startup | Go-owned launch screen, permission app name and outer chrome cannot match a standalone app |
| Workspace contracts/domain/rules/localization | Full tests/builds and real guide/material/barcode actions | Data coverage/recognition accuracy claims are unchanged |
| ReactDOM / react-native-web | Actual Mac Chrome browser controls and layout | Browser adapters are not Expo Go and OS-native UI is different |
| expo-dev-client | Dependency for the separately built development host | Not something stock Expo Go can load to gain custom native code |
| KierratysLocalVision, Core ML/Vision/libjpeg, ML Kit/ONNX | Existing native implementation retained, guarded out of stock Go | Not bundled in Go. Object-only own-server substitute needs a network; no false offline/OCR/catalogue parity |

## Validation and open acceptance

Run directory: `work/go-ui-parity-20261117.BiY0a8` (ignored).
Full `pnpm validate` passes2108tests (941Node+1167workspace) and all builds.
Mobile validation passes. Actual Mac Chrome157 real-model smoke passes JPEG/
PNG→preview→confirmation/back→model→spoon/material/source, invalid SVG,
synthetic-camera cleanup, offline recovery and persistent EN/reload. Four
FI/EN/light/dark390/320profiles pass20 recorded control/layout stages with no
page errors and no photo uploads from manual/navigation actions.

Actual Go API35emulator camera→preview→consent/back→explicit send→real model
result and shared manual invalid/valid public barcode now pass as well
(android-controls-final.log). The synthetic camera frame is appropriately
unclear, not a claimed recognized product. Final screenshots show distinct
New picture and Enter another code actions. Native-library probes pass again
on final source (delivery-native-library.log). Only the task's QA emulator and
its loopback8098Metro are stopped; owner Go8096/web8097/model3004stay available.

Screenshots are inspectable, but common source does not prove pixel-identical
OS rendering. Owner answers “joo” to the new combined Go photo/manual-barcode
protocol: owner-reported acceptance, not independently observed pixels. Later
authorized native23Release is built/signed/verified/installed and launched after
owner unlock, with filtered inventory/process receipts. Source0884d82is on
KierratysAppi/main; current CI's dependency audit fails the documented upstream
high, while other checks pass. See CURRENT_STATE/TEST_EVIDENCE. No fresh Windows
runner, physical Samsung, universal accuracy or store readiness claimed.

Reproduce with a configured own recognition service and web Metro:

```sh
pnpm validate:mobile
pnpm validate
pnpm --filter @kierratysappi/mobile exec expo install --check
# From mobile/app, using the same pinned Doctor as CI:
pnpm dlx expo-doctor@1.21.5
# Actual browser/model test; use the installed browser executable if needed:
node scripts/qa/browser-ai-smoke.mjs work/new-browser-proof
node scripts/qa/recognition-parity-smoke.mjs work/new-controls-proof
```

For Go setup and its explicit network boundary see
[EXPO_GO_NETWORK_RECOGNITION.md](EXPO_GO_NETWORK_RECOGNITION.md).
Official host limitations and research references:
[expo-go-ui-parity-2026-11-17.md](../research/expo-go-ui-parity-2026-11-17.md).
