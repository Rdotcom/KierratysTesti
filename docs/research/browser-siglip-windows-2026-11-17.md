# Browser capture and Windows host — November17, 2026

Reuses the existing frozen SigLIP2 model/classes/gate; this is a browser transport
and local-host compatibility unit, not a new training/accuracy study.

Primary sources accessed November17:

- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia —
  explicit permission and secure contexts for camera; use localhost/HTTPS,
  audio:false, bounded video and track cleanup. No security bypass or private
  Mac webcam capture used by automated tests.
- https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap —
  local decode/orientation; inspect signatures/dimensions before allocating,
  close bitmaps, bound canvas and produce metadata-free JPEG.
- https://docs.python.org/3/library/venv.html — environments are OS-specific;
  Windows Scripts/python.exe versus POSIX bin/python. Recreate, do not transfer
  the Mac environment to Windows; no activation/policy change required.
- Official version metadata https://pypi.org/pypi/pillow/13.0.0/json,
  https://pypi.org/pypi/numpy/2.5.5/json,
  https://pypi.org/pypi/onnxruntime/1.32.0/json — all three have CPython3.12
  win_amd64wheels. Availability is not proof of successful Windows execution.
- https://onnxruntime.ai/docs/install/ — Windows dependent runtime requirements;
  installation of external runtimes/terms remains the machine owner's action.
- https://registry.npmjs.org/@playwright%2ftest/latest —1.65.1checked and exactly
  pinned as a development-only real-browser regression dependency.
- https://api.github.com/repos/actions/setup-python/releases/latest and exact
  v7.1.0tag reference — verified commit6d4fd22b20465ccc0f7354476588e8df7c9ca0e0.
  Other workflow action pins reuse existing reviewed repository pins.
- https://docs.github.com/en/billing/concepts/product-billing/github-actions —
  standard hosted runners in public repositories are free; larger runners and
  separate artifact/cache storage are not covered by that statement. Actual
  repository metadata says public. The owner explicitly authorizes one reviewed
  test-branch publication/standard Windows run; main is not modified. The proof
  workflow deliberately adds no cache/artifact upload or paid inference.

Use standard browser APIs on both desktop OSes, but keep actual runtime evidence
separate: Mac/headless fake camera, Windows-hosted Chrome/Edge, physical camera.
Use a fresh test branch parented at public main; do not mirror private development
history. Keep every uncertain model suggestion and independent sorting provenance.

## Main-delivery revalidation

Owner subsequently authorizes main. Actual CI44089429846passes full tests but
fails live Expo health19/20. Official registry endpoints accessed November17:
https://registry.npmjs.org/expo/58.0.26,
https://registry.npmjs.org/expo-dev-client/58.0.21,
https://registry.npmjs.org/expo-file-system/58.0.14,
https://registry.npmjs.org/expo-router/58.0.32.
Version/integrity matches confirmed with pnpm view. Normal pnpm resolution
independently reports the cohort/transitive publish times as today11:59–12:04UTC,
inside our required24hour maturity gate. Preserve tested pins, not a blind
upgrade/age exclusion or offline-doctor bypass. Revisit after18November14:05EET.
Official incremental-update procedure:
https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/;
official relevant changelogs:
https://github.com/expo/expo/blob/sdk-58/packages/expo-dev-client/CHANGELOG.md,
https://github.com/expo/expo/blob/sdk-58/packages/expo-file-system/CHANGELOG.md,
https://github.com/expo/expo/blob/sdk-58/packages/expo-router/CHANGELOG.md.
No unsupported inference that a version warning breaks our tested browser flow.
