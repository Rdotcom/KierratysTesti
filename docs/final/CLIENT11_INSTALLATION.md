# Client 11 developer installation — November 16, 2026

## Subsequent owner-authorized renewal — completed November16

Owner explicitly requests renewing the development signature. The earlier expiry
below is superseded: new profile created2026-11-16T10:53:38Z and expires
**2026-11-23T10:53:38Z / 23.11.2026 at12:53:38 Europe/Helsinki**.

Following [Apple's automatic-signing cache guidance](https://developer.apple.com/help/account/provisioning-profiles/edit-download-or-delete-profiles/)
(accessed2026-11-16), independently identify the one cached profile by exact
app/team/device, regular-file type/inode/size/SHA256. Move only that file out of
the actual Xcode UserData profile cache into private recoverable storage; do not
delete/revoke certificates, remove device profiles, change bundle ID or reset
app data. Old profile and previous signed app remain available for recovery.

Fresh stable-Xcode automatic-signing build succeeds and downloads a genuinely
new profile, not the previous cached one. Verify app/team/device binding, future
expiry greater than the prior expiry with over five days remaining, strict app
plus11embedded signatures, unchanged source/model/privacy/newbridge/catalogue.
Embedded5524744byteHermes SHA256 is exactly the previous installed value
45ea38249d97f482e7dd3c878164e8b00a96790dfc69123c4f27fa5874d643ca.
New signed binary SHA256
e44c51b85f5f9b724cd4b3d4dbef7f44c65301b3d780e52f3a072d728f513d55.

Replacement installation of the preserved verified artifact succeeds; targeted
inventory confirms0.1.0/11, terminate/relaunch succeeds, later samePID query
passes. No trust/login prompt was needed. No native visual/camera/offline-quality
acceptance claimed and no paid API/server exposure/GitHub push. Same model and
application code; DINO remains QAonly. No retention inspection or wipe performed.

Fresh full `pnpm validate` passes1819unique tests/allchecks/builds/18routes,
19existing warnings. Receipt root `work/ios-renewal-2026-11-16.XZmRUX/` includes
old profile, new signed KeepItGreen.app, build.log, verifier/verification receipt,
install/installed/launch/process JSONs and validate.log. Validation SHA256
61ac87a9eeb17481599f238a033f1c8c8917f504010e5e7a32d7cd21bcbab2c9;
build log518c16d72ad10f1f65240656021324de2daf1235b61912f643ac44b30e3457e2.
Initial metadata inspection has an extra-brace syntax failure before any mutation;
corrected bounded read succeeds, then the exact profile move/build proceeds.

## Initial update (historical profile expiry)

Owner requests updating the iPhone and then continuing the installation. Source
commit `7ed3c8b610746947330ce8c9917b7305bd15bdf9`, clean integration worktree;
no new feature, dependency, GitHub fetch/push or production release in this unit.

## Delivered artifact

- Existing KeepItGreen identity/version0.1.0, build11 replaces installed build10.
  No uninstall, container read, data reset, photo acquisition or location access.
- Stable Xcode26.6/iPhoneOS26.5 Release build succeeds with developer signing,
  existing Personal Team and explicit current LAN API origin. Dotenv/telemetry
  disabled; no key read or paid inference. Preserve unsigned app before rebuild,
  then clone the verified signed artifact into the private installation directory.
- Strict app plus11embedded signatures pass. Profile binds exact app/team/device,
  is valid, and reuses creation2026-11-10T10:06:45Z/expiry2026-11-17T10:06:45Z.
  **Expires17.11.2026 at12:06:45 Europe/Helsinki. This installation did not renew it.**
- Embedded Hermes5524744bytes, actual newproductbridge/catalogue/Overview present;
  all13model resources(23378043bytes) and privacy bytes match preserved unsigned
  app. Source Swift/bridge/catalogue hashes match the tested integration receipt.
  No QA/DINO/knownsecret markers; this bounded check is not a universal secret audit.
- Native binary SHA256
  `fda6adaf4a71e72d602f4bad743e11355215df6a5c9482010c58a7ef7919dedc`;
  Hermes `45ea38249d97f482e7dd3c878164e8b00a96790dfc69123c4f27fa5874d643ca`.

## Actual device evidence

`devicectl device install app` succeeds. Exact-bundle inventory confirms0.1.0/11.
`device process launch --terminate-existing` succeeds; subsequent exactPID query
confirms the same running application. No trust rejection occurred in this run.
This proves installation/launch/process survival, not visual rendering, camera,
airplane-mode recognition, data retention or battery/VoiceOver acceptance.

Optional agent-device first fails its UDID selector; beta-tool inventory/name
selector finds the phone and opens the app. Its XCTest helper build-for-testing
fails, so no semantic snapshot or screenshot is claimed. Close that automation
session and bring the installed app back to foreground with devicectl. Do not
misreport the separate helper failure as a KeepItGreen build/startup failure.

Existing approved LAN API is healthy and cloud-photo capability is false; no new
server exposed or restarted. Startup has embedded JS and does not require Metro.
Local recognition/catalogue/guide are local; broader online barcode lookup still
requires the current Mac/LAN/internet. No airplane-mode test was performed here.

## Validation and receipts

Full `pnpm validate` PASS:1819unique tests(788Node+1031workspace), boundaries,
format/lint/types/allbuilds/18routes;19existing warnings. No application-source
change since the tested commit. Initial private verifier has a missing closing
brace; syntax check/repaired checker pass before installation, without changing
the built app or weakening checks.

Private directory `work/ios-client11-2026-11-15.W3CcwE/` retains November15build
and November16installation continuity: `build.log`, `unsigned-release11.app`,
`signed-client11.app`, `artifact-verification.json`, `before-install.json`,
`install.json`, `after-install.json`, `launch.json`, `process-after-launch.json`,
`final-launch.json`, `final-process.json`, and `validate-2026-11-16.log`.
Final foreground launch and subsequent exact-process inventory also pass.
Validation log SHA256 `4b877168606de721397847752b2f8130ec8ee95571e54afa393a2f5a809adcbb`.

Public NO-GO/recognition quality limitations remain. DINOv2 is QAonly, not shipped.
Next time-sensitive action is renewal/reinstallation before profile expiry;
targeted variant recovery remains the next feature-development unit.
