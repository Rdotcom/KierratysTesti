# Leaf launcher icon and safe HSY credential setup — November16

## Icon delivery

Owner requests the Home leaf logo as the launcher icon. Built-in imagegen uses
only the existing owner-supplied welcome illustration as edit target, never the
credential screenshot. Selected faithful generated extraction/upscale is saved
in `mobile/app/assets/brand/leaf-mark-v1.png`; original Home artwork is unchanged.
The derivative is not a claim of pixel-identical extraction or new brand rights.
Opaque1024iOS/default icon, transparent Android adaptive/monochrome safe-area
variants and64favicon are built mechanically from the committed master. Old icon
and splash assets remain recoverable. App/deep-link identity is unchanged.

Exact built-in prompt (background-extraction; transparent output):

> Use case: background-extraction. Asset type: KeepItGreen mobile application icon master, transparent PNG, square 1024x1024. Input image 1 is the EDIT TARGET: existing owner-supplied app artwork. Extract ONLY the existing green recycling LEAF SYMBOL at the top of this artwork (three curved green leaves arranged in a recycling circle, approximately original x384–565 y109–278). Preserve the exact leaf silhouettes, orientation, gaps, small arrow tips, rich green hues and gentle painted shading of that symbol as faithfully as possible. Do not design a different logo. Enlarge cleanly, centre the complete standalone mark in a square canvas; mark occupies about 80% of canvas width and height. True transparent background including all gaps/centre. Remove all lettering (including KeepItGreen), people, bottle, scenery and original pale backdrop. No new objects, no wordmark, no text, no border, no rounded-square container, no drop shadow. Output only one isolated leaf recycling symbol. The input is a decorative logo only, not a product/recognition result.

Actual generated master1254×1254RGBA, not requested1024; renderer validates actual
dimensions and pinned hash, then exports1024variants. Source/master attribution,
hashes and renderer instructions in `mobile/app/assets/brand/README.md`.

First620pxAndroid foreground fails unchanged332pxsafe circle (maxradius414.50).
Recompiled480pxvariant passes; no safe-area relaxation. Byte-parity `--check`,
monochrome-alpha identity, opaque RGB/default icon, all config paths and original
artwork pins pass. Three new Node icon regressions; four secret-setup regressions.
Initial secret-policy test matched a comment's word “clipboard”; corrected to
actual operation patterns, preserving no-IO/no-echo checks. Failure logs retained.

Normal signed Release0.1.0(18), Android configuration versionCode4(not an Android
build claim).11embedded signatures,14legacy pins/candidate/JPEG/privacy/no-QA
checks pass; replacement installed, exact inventory18and launch verified. Native
compiled120pxAppIcon is visibly the new leaf after standard PNG conversion of
Apple's optimized format. Source1024icon also visually inspected. Hermes SHA
matches installed17exactly: no new application JS/inference/network behavior.
Existing profile reused through23November12:53:38Helsinki, not renewed.
Private receipts:`work/leaf-client18-20261116.xyHJ8o/` and
`work/leaf-icon-20261116.LNSXyx/`; final checks in TEST_EVIDENCE.md.

## HSY access, rotation and storage — not an import

Owner provides an access-approval screenshot and initially pastes credentials.
No pasted value is saved, printed back, committed or used for any API request.
Owner confirms reset (“uusittu”) following
[MuleSoft's official reset procedure](https://docs.mulesoft.com/exchange/about-my-applications).
Owner then explicitly authorizes a separate local Terminal prompt, inputs the
replacement privately and confirms “tallennettu”. Tool opens Terminal only;
agent never reads its secret input/output or takes a screenshot of it.

`scripts/setup-hsy-credentials.mjs` requires a private TTY, disables echo, bounds
ASCII input, validates ID/secret shape and rejects controls/shell syntax. No
network, clipboard reads, secret arguments, value/hash logging or overwriting
existing settings. Exclusive O_NOFOLLOW/0600create writes only dedicated ignored
`backend/api/.env.hsy.local`; it never reads/merges existing OpenAI configuration.
Metadata-only verification confirms regular non-symlink/0600/Git-ignored file.
This file is NOT mobile configuration and is NOT automatically loaded by the
existing API dev command. Only a future validated server/import process may load
it locally. Do not `cat`, log, commit or expose its contents or environment.

Owner initially confirms **DEV** permission. [HSY's official instructions](https://avoidatastr.blob.core.windows.net/avoindata/AvoinData/2_Jatteet_ja_kierratys/Jateopas/HSY%20J%C3%A4teopas%20-%20ohje%20apin%20k%C3%A4ytt%C3%B6oikeuden%20hakuun.pdf)
distinguish DEV/PROD grants and data. Owner subsequently confirms free PROD
approval. Anonymous portal/public1.0.4OAS independently identify the HTTPS PROD
base and client_id/client_secret headers; no inferred DEV→PROD hostname.
One bounded/no-redirect PROD request returns401. Owner clarifies that PROD
permission was granted to a DIFFERENT client application. No automatic retry.

Owner privately enters that application's credentials with `--prod`, exclusively
creating separate ignored0600`backend/api/.env.hsy.prod.local`; original DEV
file is preserved. Agent checks only metadata, inherited HSY vars absent, no
values or credential hashes printed. Exactly one new PROD request after this
external-state change returns200/1557bytes, one remote-control hit. Only field
names/types/counts are recorded; raw guide body/headers/secrets are not persisted
or logged. Two authenticated reads total, zero DEV reads, no photos/user location/
paid calls. First401receipt remains, not rewritten as success.

Actual response has nullable notes/queryId, synonyms, wasteTypes including
informationPageUrl, multiple recyclingMethods; do not trust example-only schema
or silently pick its first reception. Source/protocol details:
`docs/research/hsy-prod-api-verification-2026-11-16.md`.
No owner account/credential blocker remains. **Snapshot import and app search
integration are not implemented by this access check**; existing23item app
catalogue is unchanged. NEXT_ACTION covers validated/attributed/HSY-scoped import.
Preserve CC-BY4.0/version/date/unknowns; all-region/model/Android/MEM-01/store
NO-GO gates remain. No credential values are in this report or source control.

No GitHub push, paid inference/service, credential export or account mutation
by the agent. Rotation/access are owner-operated; only local artwork/setup work
is committed.
