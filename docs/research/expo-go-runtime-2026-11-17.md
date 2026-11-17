# Expo Go boundary — checked 17 November 2026

Primary sources:

- https://docs.expo.dev/workflow/customizing/ — Expo Go cannot acquire a
  project's custom native modules; a development/native build is required.
- https://docs.expo.dev/versions/latest/sdk/camera/ — SDK58Camera/CameraView,
  barcode scanning and permissions are included in Expo Go.
- https://exp.host/--/api/v2/versions — actual58.0.0entry matches Expo58.0.25,
  React19.3.0/RN0.88.1 and Android Go58.0.5. Do not use legacy top-level2.xURLs.
- Installed primary SDK source: `expo/src/environment/ExpoGo.ts` implements
  `isRunningInExpoGo()` by probing the native ExpoGo host module. Use this plus
  the native storeClient constant, not mutable app metadata or guessed versions.

Official Expo repository release APK225,952,197bytes, SHA256
`d979cf81c56c5432c5aa69adc9497521ee72d1f87e92eee33bc949167a40f1a6` matches
GitHub asset digest; Android APK signature verified before isolated install.
Release: https://github.com/expo/expo-go-releases/releases/tag/Expo-Go-58.0.5.
Receipts in `work/expo-go-compat-20261117.VlrKmJ`.

Keep native offline inference in the existing full build. Do not pretend a
manual answer is AI, upload a photo automatically, add a paid fallback or
replace the pinned inference pipeline solely to run inside the stock host.
