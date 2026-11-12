# Own vision and sound implementation sources

Stable primary research reviewed for the new design on November10; installed
implementation/SDK metadata rechecked on November12. No copied implementation
or pretrained weight is added to the own pixel engine.

- Lowe2004 author paper, §§5–6, weighted gradient orientation and scale-conditioned
  sampling: https://www.cs.ubc.ca/~lowe/papers/ijcv04.pdf . Our Harris/binary
  implementation is not SIFT or a claim to its measured accuracy. Four levels,
  generated comparison pattern and conservative versioned matching are ours.
- SDK58 audio API/plugin defaults:
  https://docs.expo.dev/versions/v58.0.0/sdk/audio/ . Installed
  Expo58.0.23/bundledNativeModules.json pins audio~58.0.11/asset~58.0.20.
  Exact native types/source use player.remove(), despite documentation wording
  about release. Prefer actual pinned API/types over copying a prose example.
- Native import behavior:
  https://github.com/expo/expo/blob/sdk-58/packages/expo-audio/src/AudioModule.ts .
  Eager requireNativeModule requires an optional caught lazy boundary on old clients.
- Apple playback category/silent/mixing principles:
  https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/ambient
  and https://developer.apple.com/design/human-interface-guidelines/playing-audio .
  Source configuration is not physical silent-switch or music-interruption proof.

November12 online Expo recommendations advanced to58.0.24 and related patches;
retain that failed update check and locally executable maintenance rather than
excluding packages or labelling the old pinned graph latest. Offline installed-
SDK check answers only internal compatibility, not the online recommendation.
