# Own-server image suggestions in Expo Go

November17presentation update: native/Go/browser now share the app-owned heading,
start/manual-barcode/preview/recovery components. After the common Recognize
action, Go/web open a separate recipient/retention/HTTP/explicit-send confirmation.
Opening or cancelling it sends nothing. Native-only details remain honest rather
than simulated; see [EXPO_GO_PARITY.md](EXPO_GO_PARITY.md) for implementation,
library checks and remaining physical-device acceptance. Installed iPhone22 is
not replaced by this source refactor.

Implemented November 17, 2026. This is an optional network mode, not offline
native-module support or public release approval. No paid inference/API key is
needed. The owner pays any ordinary hardware/electricity/network/hosting costs.
The existing installed native app keeps its on-device pipeline unchanged.

November17wording alignment: Go and browser now use the native-style base
title/review/new-picture labels and calmer FI/EN instructions. They still say
that recognition needs the own server/network and require separate photo sending;
they do not claim on-device/offline processing. No model/provider behavior or
installed-native-app change. Updated-copy evidence is in TEST_EVIDENCE.md.

## What is shared, and what is not

Stock Expo Go captures a JPEG, strips metadata and shows a preview. Only the
separate **I agree to send · identify image** button uploads it to the displayed
own-server origin. The server uses the existing Google SigLIP2 weight-only INT8
ONNX model and fifteen frozen class prototypes. Returned uncertain object types
use the same object-choice → material-choice → sourced local sorting guidance
and explicit recycling-record controls as the native app. Material and exact
product identity are not inferred by this network mode. Barcode scanning/manual
GTIN lookup remain separate and retain their catalogue/cache/public OFF path.

The server is **not** an OpenAI proxy, paid fallback, universal product database,
OCR/barcode reader or independent accuracy improvement. Out-of-scope or multiple
objects may return no choices; manual guidance remains available. Native iOS,
native Android and this server have honestly distinct preprocessing identities.
Four existing development JPEGs pass the unchanged top-one/0.005 score gate;
that is compatibility evidence, not an accuracy percentage or Samsung acceptance.

## Reproducible setup

Physical iPhone prerequisite: install matched Go58 and sign into the **same
Expo account** in phone Go and Mac Expo CLI. Expo and Apple accounts are
different. Check CLI with `pnpm --filter @kierratysappi/mobile exec expo whoami`;
if needed, sign in yourself with `pnpm --filter @kierratysappi/mobile exec expo
login`. Do not paste credentials/codes into chat. Current physical iOS Go checks
this even when Metro appears healthy; Android/emulators are different. USB and
renewing the separately installed native app are not required for Go over Wi-Fi.
Official requirement rechecked November17:
https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/.

From repository root, with Python 3.12 and the repository Node/pnpm versions:

```sh
python3.12 -m venv work/siglip-server-venv
work/siglip-server-venv/bin/python -m pip install -r backend/data-providers/python/requirements.txt
pnpm vision:prepare work/network-model
export SIGLIP_PYTHON="$PWD/work/siglip-server-venv/bin/python"
export SIGLIP_ASSETS="$PWD/work/network-model"
node scripts/verify-network-model.mjs
pnpm dev:siglip
```

The staging command intentionally refuses to overwrite existing assets. It
checks the original model/prototype SHA256s and retains licences. Runtime code
reads only this independent ignored directory, never imports mobile files. The
exact pinned Python versions are checked by the worker. The server deliberately
does not read `.env.local`, OpenAI/HSY secrets or any paid-provider configuration.
The previous ordinary backend may keep its own independent barcode port.

For an Android emulator only, reverse both ports using the chosen emulator's
actual serial, then start Expo in another terminal:

```sh
adb -s emulator-5556 reverse tcp:3004 tcp:3004
adb -s emulator-5556 reverse tcp:8096 tcp:8096
EXPO_PUBLIC_SIGLIP_BASE_URL=http://127.0.0.1:3004 EXPO_NO_DOTENV=1 pnpm --filter @kierratysappi/mobile exec expo start --go --localhost --port 8096
```

Use **Identify → Identify an item with AI**. Camera opening checks capabilities
without sending a photo. Capture does not send. Review the recipient and then
explicitly approve. Cancel/back/background abort the request and clear transient
screen state. A missing origin shows real manual/barcode recovery, not a dead AI
button. A sleeping/unreachable Mac gives an actionable error, not a fake result.

For a physical phone, loopback means the phone itself, **not the Mac**. On a
trusted private Wi-Fi, start the dedicated server with `HOST=0.0.0.0 pnpm dev:siglip`
and Expo with `EXPO_PUBLIC_SIGLIP_BASE_URL=http://<actual-Mac-LAN-address>:3004
EXPO_NO_DOTENV=1 pnpm --filter @kierratysappi/mobile exec expo start --go --lan`. Replace the placeholder with the
Mac's actual address; it is documentation, not a configured production service.
Scan Expo's QR code in matched SDK58 Go and allow local-network/camera access if
the OS asks. Keep the Mac awake. Do not forward this port, use public Wi-Fi or
expose it via a tunnel. HTTP is unencrypted and disclosed in both languages.
Stop the two terminal commands with Ctrl-C after use. A remotely hosted version
would need HTTPS, authentication, deployment review and operational ownership;
it has not been published by this task.

## Safety and retention

- Strict versioned consent/request/result contracts. Only bounded JPEG input;
  no URL fetching, external image retrieval, guessed material or verified claim.
- 1.5 MB decoded JPEG, 8 MP decoded image, 2,001,024 byte request body;
  response/worker output ≤8 KiB. Metadata removed before network and again at
  the server boundary. Invalid JPEGs fail without parser text in the response.
- One worker at a time, four POSTs/minute/client, twelve-second worker deadline,
  SIGTERM then SIGKILL, disconnect cancellation and fifteen-second UI deadline.
  UI prevents duplicate sends and does not automatically retry.
- The capture's exact validated cache file is deleted before upload. Only the
  OS-supplied cache root is trusted, including Expo Go's encoded experience root;
  leaf traversal/foreign roots are refused. Images/results are not scan history
  or analytics. Choosing **Mark as recycled** records only the existing explicit
  local material action, not the image.
- The own-server implementation deliberately writes no photo files, caches or
  image logs. Routine API logging is off; worker stderr is discarded and service
  secrets are not passed to the subprocess. No forensic memory erasure or OS
  swap/crash-dump guarantee is implied. Infrastructure/proxies must not add body
  logging; do not use public deployment without a retention/privacy review.
- Dedicated runner refuses `NODE_ENV=production`; existing paid photo route is
  disabled because no paid recognizer is supplied. No account/secret changed.

## Evidence and limits

Run directory: `work/network-siglip-20261117.Nb3TDy` (ignored). See the current
TEST_EVIDENCE entry for exact commands/counts and retained failed attempts. A real
Android Go58.0.5 camera→preview→explicit send→own ONNX server→uncertain result
passed. The emulator's synthetic camera image was appropriately unknown, not a
product test. A real licensed spoon JPEG through HTTP returned spoon/fork/knife.
Physical Samsung, iOS Expo Go/local-network permission and physical camera
quality are not verified by that evidence. Installed native iPhone22 and remote
GitHub branches were not replaced or pushed in this unit.

Later November17physical followup: owner completes matching CLI/Go login and
reports “Metallinkeräys-ohje näkyy” after the scripted iPhone Go spoon photo→
preview/consent→Lusikka→Metalli flow. This adds one owner-reported physical Go
path, not a general camera/accuracy/offline claim. EN/reopen/barcode followup
outcomes are below; native offline and physical Samsung remain distinct. See the
newest TEST_EVIDENCE entry rather than treating the earlier emulator-only limit
as the final status of this one physical iPhone trial.

Owner also confirms EN survives project reopening and a verified public
non-bundled barcode opens the named product. He clarifies the message was
“Packaging data is missing”, not product_not_found. Current Go barcode lookup
deliberately requests identity fields only; this is not evidence that the
source database lacks packaging data. This controlled physical smoke passes;
it is not full offline/native-provider/Samsung or general barcode coverage.
