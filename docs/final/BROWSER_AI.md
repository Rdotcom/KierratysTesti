# Browser image recognition — macOS and Windows

This is the website opened in Chrome/Edge, **not Expo Go**. Recognition uses the
same pinned Google SigLIP2 CPU model on your own computer. No AI API key or paid
inference service is required. It suggests object types, not verified product
identities/materials. Confirm the object and material before reading the sourced
sorting guidance. The native installed app's offline pipeline is unchanged.

## Windows quick start (PowerShell, x64)

Use the current `main` branch of `roopeaal/KierratysAppi`. In an existing clean
main checkout, run `git pull --ff-only origin main`; check `git remote -v` first.
Do not reset or discard local work to update. For a separate fresh copy:

```powershell
git clone --branch main https://github.com/roopeaal/KierratysAppi.git
cd KierratysAppi
```

Git pull alone does not install Python, dependencies or model files. Initial
setup below is required once per computer. Existing Node24.x/pnpm11 and
Python3.12x64 are needed; install Python from
its official distribution if missing. Do not copy the Mac's Python environment
or use its private Wi-Fi address from another network.

```powershell
pnpm install --frozen-lockfile
py -3.12 -m venv work\siglip-server-venv
.\work\siglip-server-venv\Scripts\python.exe -m pip install -r backend/data-providers/python/requirements.txt
pnpm vision:prepare work/network-model
pnpm dev:web:recognition
```

Open **http://localhost:8097/local-photo** in Chrome or Edge. Keep the terminal
running. Ctrl-C stops the two services. No PowerShell execution-policy change,
virtual-environment activation, Expo Go, Android Studio or iPhone is needed.

On Mac, create the environment with `python3.12 -m venv work/siglip-server-venv`
and install requirements using `work/siglip-server-venv/bin/python -m pip install
-r backend/data-providers/python/requirements.txt`, then use the same `pnpm
vision:prepare work/network-model` and `pnpm dev:web:recognition` commands.
The model-staging command refuses overwrites. If a frozen hash fails in an older
Windows checkout, do not weaken it: use a fresh checkout with the supplied Git
attributes, which prevent CRLF conversion of hashed prototype bytes.

If Windows reports an ONNX DLL dependency error, follow ONNX Runtime's official
Windows runtime requirements: https://onnxruntime.ai/docs/install/. Any Microsoft
runtime installation/terms stay with the machine owner. No installer is silently
downloaded or run by this app. Camera access also needs OS/browser permission and
working hardware; file selection works without a camera.

## Try the flow

1. Choose **Choose an image file** (JPEG/PNG/WebP, ≤12MB and ≤16MP) or **Open
   camera**. Animated images, HEIC and SVG are intentionally refused.
2. Inspect the preview and the server receiving the image. Selection/capture
   alone makes **no image request**. The browser prepares a bounded JPEG without
   metadata; large supported images are resized and re-encoded.
3. Press the separate **I agree to send · identify image** button. Choose an
   appropriate object suggestion, then its material. Unknown/multiple/incorrect
   suggestions offer manual guidance, not a fabricated exact match.

Browser camera requires a trustworthy context: localhost on this computer or
HTTPS. Opening a plain HTTP LAN address from another computer is not equivalent;
camera is unavailable there and file selection remains the fallback. Do not
disable browser security or certificate checks to get around this.

## Privacy and compatibility

The dedicated loopback API is port3004; web is8097. Exact CORS origins are
localhost/127.0.0.1:8097, never `*`. No credentialed browser requests, image URLs,
image history, image analytics, paid providers or secret files. Uploaded file
names are not sent or logged. Input signatures/pixel/file bounds precede decode;
camera tracks stop after capture/cancel/navigation/tab hiding. A late permission
result is disposed after cancellation. A preview can be cancelled without upload.
Server limits and explicit consent remain those in EXPO_GO_NETWORK_RECOGNITION.md.
No forensic OS swap/cache-erasure guarantee is made.

The launcher uses Node directly, native Windows paths and Scripts/python.exe;
no POSIX environment assignments or shell-dependent `.cmd` spawning. Windows
worker receives only necessary OS DLL/temp-path variables in addition to the
same restricted inference environment, never service keys. Models/prototypes
and their licences are unchanged; the model is staged independently of mobile.
Windows CPython3.12x64 wheels for all three pinned packages were verified in the
official PyPI metadata. No Windows ARM64/physical-camera acceptance follows.

Each teammate may run this completely on their own computer after initial tool/
dependency installation. The browser UI, SigLIP2 and general bundled guidance
do not require a paid/cloud recognition service. Barcode provider lookup is a
separate feature and may require internet. This is not public production hosting.

## Reproducible browser proof

```powershell
pnpm exec playwright install chromium
pnpm test:web:recognition
```

This launches isolated loopback services, then a real browser and real model:
licensed spoon JPEG → preview/no upload → consent → object → chosen metal →
sourced guidance; PNG canvas conversion; invalid SVG; simulated browser camera
capture/cancel and ended tracks; English persistence/dark/narrow/reduced motion;
offline recovery. The camera is explicitly synthetic, not the physical webcam.
Results/screenshots are ignored under work/browser-ai-proof. Optional
`WEB_AI_CHANNEL=chrome` or `msedge` selects an installed browser (PowerShell:
`$env:WEB_AI_CHANNEL = 'msedge'`). A separate Windows workflow runs the same
actual model parity and both installed Chrome/Edge flows on windows-latest.
It has no cache/artifact upload, paid AI key, larger runner or production deploy.

Current evidence, retained failures and exact Windows result status are in
TEST_EVIDENCE.md. Mac Chromium evidence does **not** count as a Windows test.

Verified November17: actual Windows x64 model parity, Chrome156and Edge156all
pass [run44086483622](https://github.com/roopeaal/KierratysAppi/actions/runs/44086483622)
for source dde3ff3. Mac Chrome157passes too. Camera tests use synthetic video;
your own webcam/OS permission still needs a physical test. The owner now
authorizes sharing this tested implementation in main; this is source delivery,
not a public hosted service or a new production-readiness claim.

SDK58patch followup: the owner explicitly disabled the release-age waiting
period and requested the compatible Expo updates. The new cohort installs and
local Expo Doctor20/20passes; compatibility/security checks remain enabled.
No API key or paid recognition service is introduced. Current exact test and
publication outcomes, including retained earlier failures: TEST_EVIDENCE.md.
