# Android offline recognition adapter — November17, 2026

Access date:2026-11-17. This is implementation/development-parity evidence, not
physical Samsung acceptance, a broad accuracy claim or public-release approval.

## Decision and primary sources

- ONNX Runtime Android CPU is the separate native runtime; no Apple/CoreML result
  is fabricated on Android. Its Java API supports bounded sessions, owned tensors
  and termination options. Sources:
  https://onnxruntime.ai/docs/tutorials/mobile/ ,
  https://onnxruntime.ai/docs/get-started/with-java.html ,
  https://onnxruntime.ai/docs/api/java/ai/onnxruntime/OrtSession.SessionOptions.html .
- Quantization must be measured against unchanged scores rather than inferred
  from smaller bytes: https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html .
- Bundled Latin OCR16.0.1 works without first-use model download. Existing
  Expo-camera already uses the bundled barcode SDK17.3.0. Sources:
  https://developers.google.com/ml-kit/vision/text-recognition/v2/android ,
  https://developers.google.com/ml-kit/release-notes .
- Image/text input processing is on device, but ML Kit SDK technical device/app/
  usage/performance information may be sent to Google. Android-specific in-app
  privacy text links this disclosure; no claim of zero SDK telemetry or a guessed
  Google retention period. Sources:
  https://developers.google.com/ml-kit/android-data-disclosure ,
  https://developers.google.com/ml-kit/terms .
- Expo module Promise interfaces:
  https://docs.expo.dev/modules/module-api/ .
  Official SDK terms/install source: https://developer.android.com/studio/terms ,
  https://developer.android.com/studio . Owner approved local SDK licence/install.

## Frozen model and export

Google SigLIP2 base-patch16-224, Apache2:
https://huggingface.co/google/siglip2-base-patch16-224 , revision
`75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2`. Existing frozen FP32 vision subset
SHA256:`ea5dc3617498675e75a9bd8eb23b5761cc92acc5d7d5cfe9b86fd86c9f3810b1`.
Fifteen text prototypes remain byte-identical:
`eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21`.

PyTorch static ONNX17 export, image only, input1×3×224×224, output1×768.
Dynamic activation+weight INT8 was rejected: four score errors0.039–0.043 exceed
the unchanged0.005gate. Do not promote it or erase the failure.

Weight-only per-output-channel INT8,78matrices, FP32 activations passes four
existing development tensors: all original top1labels; maximum errors
0.00216761555/0.00214883087/0.00150855458/0.00443058841. Final model95,661,204bytes,
SHA256:`d90cf29df7a26cd39d5c8d03c0b6c13179f03e8e905659111be3cbf54552984b`.
This is four-image parity, not recognition quality, confidence calibration or
exact product/material identification. Android JPEG decoder is explicitly a
different preprocessing identity; real native JPEG comparison is mandatory.

## Runtime and data boundary

Android26+, sRGB BitmapFactory/EXIF, independently ported separable antialiased
bilinear resize with fixed22bit coefficients. Unsupported/malformed inputs fail
closed. JPEG≤1.5MB, base64≤2Mcharacters, dimensions≤4096axis/8MP. Model is streamed
and verified into public-model cache; never95MB on Java heap. CPU2threads, session/
tensor/run options released after request. Single owned worker;12second deadline
and matching-ID cancellation suppress late results without freeing busy early.

OCR exports only bounded allowlisted material markings; barcode candidates are
checksum-validated in shared contracts. No raw arbitrary OCR, photos, keys or
remote inference. Material/source-region confirmation remains separate. Image
suggestions are unverified/uncalibrated object forms, not exact brand/package size.
First-use OCR is bundled; no paid service or model-download server is required.

## Toolchain and receipts

Temurin21.0.13+9 ARM64 official archive SHA256:
`bf036b35b071bfb2f54f2c0af8ee8d88afa95ee6eb3dce02c0f94cfc2524d04a`.
Android commandline-tools23.0 archive SHA256:
`7e601c04e7173754b3d051a87bb4c3a8243c65a9d7bfa9356ed6499fb8953fa3`.
SDK37/build-tools37.0.0/NDK27.1.12297006; Gradle9.4.1; ORT1.32.0;
onnx1.23.2, CPU export onnxruntime1.32.0. Isolated API35AOSP ARM64 emulator.
Recipes under scripts/qa; ignored work/android-support-20261117.2p6Ggr contains
original conversion failure/success receipts, native build logs and runtime tests.
Fixtures are licensed, stripped, existing development JPEGs plus generated test
marking/barcode images, test-APK-only. No personal camera files used in QA.

Actual runtime, release APK and device installation outcomes are recorded in
docs/final/TEST_EVIDENCE.md when completed, not assumed from compilation.
