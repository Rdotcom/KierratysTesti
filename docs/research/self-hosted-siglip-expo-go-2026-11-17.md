# Self-hosted SigLIP2 transport — November 17, 2026

This investigation reuses the repository's pinned model, prototypes, licensed
JPEG development fixtures and score gate. No new accuracy dataset, training,
paid service or universal recognition claim. Stock Expo Go cannot load the
project's custom native model adapter; moving the same model to the owner's
computer is a transport alternative, not on-device inference in Go.

Primary sources checked November 17, 2026:

- https://docs.expo.dev/get-started/start-developing/ — Expo Go vs development
  builds and the fixed native-runtime boundary.
- https://docs.expo.dev/versions/latest/sdk/camera/ — SDK58 CameraView is included
  in Go. This supports capture availability, not physical-device camera quality.
- https://huggingface.co/docs/transformers/model_doc/siglip2 — model image/text
  representation; similarities are not calibrated sorting confidence.
- https://pypi.org/pypi/Pillow/json — official current13.0.0 release metadata.
  CPython3.12 macOS ARM64 wheel SHA256:
  `fc481f742ccda20e9ed760b8f978dff50f2a4e9bc253ac167fb0a05b0783ef52`.
  Download hash verified before isolated installation; old project venv was not
  modified. Current parser used instead of the older cached Pillow12 runtime.
- https://pypi.org/pypi/onnxruntime/json — pinned existing1.32.0 runtime; NumPy2.5.5
  and Pillow13.0.0 also pinned. No latest-version lookup at inference time.

Reuse model revision `75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2`, original
Apache2 notice, model95,661,204bytes/SHA256
`d90cf29df7a26cd39d5c8d03c0b6c13179f03e8e905659111be3cbf54552984b`,
prototype SHA256
`eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21`.
No model/prototype content changed. The server's Pillow13 bilinear JPEG path has
its own identifier. Original four JPEGs keep top-one results with max score error
0.0038615619379573553, below the **unchanged0.005** gate. Test-image attribution
remains alongside the existing Android parity fixture manifest. These are reused
development images, not independent accuracy/coverage validation.

Decision and executable setup: D-118 and
`docs/final/EXPO_GO_NETWORK_RECOGNITION.md`. Network mode needs explicit upload
consent, an available owner-run computer and suitable network. No hosting or
provider is promised free of all operating costs, and no service is published.
