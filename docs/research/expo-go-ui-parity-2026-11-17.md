# Stock Expo Go: presentation versus native capability

Accessed November17,2026. Primary official documentation only; no dependency,
account, paid cloud build or public deployment is required by this UI refactor.

- https://docs.expo.dev/develop/development-builds/introduction/
  Go is a prebuilt native host. Custom native libraries require a separately
  built app; a development build does not run inside stock Go. Therefore the
  app's custom local-vision module cannot be made available by JS/UI changes.
- https://docs.expo.dev/versions/latest/sdk/camera/
  Camera/photo/barcode capture is included in Go. Custom permission strings and
  native configuration plugin changes require a new binary.
- https://docs.expo.dev/versions/latest/sdk/splash-screen/
  From SDK52, Go/development builds cannot fully replicate standalone splash
  presentation; inspect release builds for splash acceptance.
- https://docs.expo.dev/versions/latest/sdk/system-ui/
  Root-view/appearance APIs are native system concerns. Config plugin properties
  need a binary build. The current UI already paints its own React surfaces;
  do not change global appearance just to manufacture a library proof.
- https://docs.expo.dev/versions/latest/sdk/gesture-handler/
  Included in Go; current SDK recommends3.3.0, matching this repository.

Decision: share native/Go/browser app-owned components, keep a truthful and
separately confirmed server transport, preserve native-only features rather
than replace them with dummy buttons, and report each evidence lane separately.
See docs/final/EXPO_GO_PARITY.md for actual SDK/runtime/control test evidence.
