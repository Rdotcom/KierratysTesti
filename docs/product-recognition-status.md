# Offline product recognition implementation status

2026-11-16 — active master task; NOT production-validated.

Delivery update: owner-requested signed0.1.0/build11is now physically installed;
inventory/launch/samePID verified, not camera/UI/airplane-mode acceptance. Renewed
profile expires23.11.2026 at12:53:38Helsinki; renewal/reinstallation completed. DINOQAmodel remains
outside the app. See docs/final/CLIENT11_INSTALLATION.md; earlier delivery status
below is historical. Fresh1819tests/allchecks/builds pass; no GitHub push.

## Implementation sequence

1. Preserve the existing Expo 58/iOS Vision/Core ML camera/material flow and
   shared sorting boundary. Add a versioned offline catalogue and deterministic
   barcode lookup; source assertions are not verified manufacturer mappings.
2. Add one bounded native operation for image-bound barcode, accurate OCR and
   genuine existing MobileCLIP embeddings. Guided single-package capture and
   fixed central detail ROI retain original-image lineage. No remote fallback.
3. Integrate the local product result in the existing photo screen, including
   absent-catalogue, ambiguity, unavailable/old-client and cancellation recovery.
   Never infer packaging material from product identity.
4. Run actual native/image/catalogue inference with networking denied, measure
   results and resources, add regressions, build and visually inspect. Preserve
   every failure and distinguish generated barcode checks from real photographs.
5. Continue coverage/model/Android/independent-capture acceptance separately;
   source-labelled development measurements do not satisfy release targets.

## Verified starting point

Commit 33690a8: existing experimental image+OCR test gives 10/17 source
agreements, zero observed wrong-source matches, 41/41 safety abstentions, but
0/5 pilot exact matches. Fixed quality gate FAIL. 1,789 automated tests pass.
The default app has coarse object/material recognition, not the experimental
SKU matcher. Latest verified installed phone is build 10, not current sources.

Five authentic cached Open Food Facts records and ten reference images are
available. Neither 500 known SKUs nor 100–200 independent unknown SKUs nor
5,000 independent camera queries exist. Separate human reviewer was waived by
the owner; this does not turn source labels into independent truth.

## Boundaries

- No cloud API/key/payment, publication, push or phone installation implied.
- Existing licensed MobileCLIP remains the app model. After owner-authorized
  cache cleanup, DINOv2-Small was actually compared in an isolated QAenvironment;
  its no-regression gate failed, so it is not promoted to an app replacement.
- The two named Finnish research documents were not found among repository
  research/attachment filenames. Existing primary-source research from today
  is retained in docs/research/multimodal-recognition-plan-2026-11-14.md.
- Catalogue metadata/source provenance and embeddings must remain separate
  from recycling rules. Unknown attributes stay null, never manufactured.

## Implemented / verified November15

- `shared/domain/src/offline-product.ts`: strict versioned source catalogue,
  canonical GTIN lookup/alias collision rejection, real per-SKU cosine ranking,
  conservative confirmation-only text/quantity reconciliation. No sorting output.
- `shared/contracts/src/offline-product.ts`: bounded native evidence/ROI/model
  contract. All original image bytes remain bound by the trusted native operation.
- `mobile/app/modules/local-vision/ios/local-vision-engine.swift`: barcode,
  full/central OCR and real existing Core ML embeddings under a total12sworker.
  `local-vision-module.swift`: exposes the new method without adding network/files.
- `mobile/app/src/features/local-vision/{catalogue,offline-product,native}.ts`:
  actual immutable local data, native/cancel/deadline adapter, shared resolver.
- `mobile/app/src/app/local-photo.tsx` and `components/offline-product-result.tsx`:
  existing UI integration, offline code entry, clear source/unknown/suggestion,
  preserved material path, no raw scores/OCR/history and explicit online exit.
- `mobile/app/assets/offline-product-catalogue.json`:5authentic OFF records and
 10actual source-image vectors,134619bytes, separate ODbL/DbCL/CC-BY-SA notice.
  Unknown manufacturer/variant/market/packaging remains null, not invented.
- `scripts/qa/{build-offline-catalogue,evaluate-offline-product,review-offline-product}.mjs`:
  reproducible import/frozen actual inference/independent receipt+rank checks.
  `offline-product-browser.cjs`: actual FI/EN offline UI, no injected predictions.

Full1814tests/strict checks/builds18routes pass; Swift6compile and29native lifecycle
checks pass. Full unsigned iOS Release11with newbridge/Hermes passes; not signed
or installed. Browser14manual cases pass in offline mode with zero external
requests. Actual60native query operations use sandbox-exec deny network*, plus
10reference encodes. Evidence/commands/failed initial checks in
`docs/final/OFFLINE_PRODUCT_INTEGRATION_RESULTS.md` and TEST_EVIDENCE.md.

Metrics:17knownsource/41audits/2generatedcodes;rankTop1=11/17,Recall5=16/17,
2confirmation-only suggestions/0wrong-source suggestions,41no-identity audits,
1initial12s timeout. Automatic visual coverage0%, accepted visual precision
undefined. Successful native latency n59p50361ms/p951261ms;maxRSS182.5MiBMac,
not phone. Source assertion/seen-view data does not establish population accuracy.
Prior experimental10/17max-margin+OCR result/gate remains unchanged, not replaced.

## Master phases / unresolved work

| Phase | Status |
| --- | --- |
| A architecture | Actual relevant existing code inspected; preserve three parts/native stack |
| B catalogue/barcode | Working bundled5product catalogue; generated actual decoding+manual offline verified. Generic importer/signed incremental updates/migrations still missing |
| C neural retrieval | Real MobileCLIP integrated; actual DINOv2comparison14/17versus11/17but one regression fails gate. Android runtime/mobile DINOparity absent |
| D OCR/fusion | Actual full+ROI text; confirmation hints only. SV/EN observed; no Finnish/independent calibration proof; first timeout remains |
| E app | Existing camera/material route and manual lookup integrated; unsigned iOS build/browser pass. Gallery/Android/physical acceptance absent |
| F measurement | Frozen authentic source corpus/OSoffline/latency/RSS measured. Independent500known/100–200unknown/sibling/multi-device dataset absent; quality targets unmet |
| G release | Software/build checks pass, public NO-GO; no physical/store/privacy/commercial reliability claim |

Status: FUNCTIONAL BUT NOT PRODUCTION-VALIDATED for the implemented bounded path;
the complete master feature is not finished. The frontend-design skill preserves
the existing typography/components and makes evidence distinctions visible,
without a separate visual redesign. No phone/GitHub/paid-service action occurred.

Owner-authorized cache cleanup removed5.6GiBlogical oldOctober28intermediate/
module and CocoaPods download files; source/apps/models/evidence/currentbuild
preserved. Free6.3GiBafterward; disk blocker resolved. Caches recover by rebuilding
or redownloading, not trash restore.

## Actual DINOv2 follow-through

New scripts/qa/dinov2/{download,run,review}.mjs and infer.py implement pinned
safetensors preparation,68real OSoffline encodes and independent83pin/rank review.
Five regressions/full1819tests pass. Top1=14/17versus11/17, paired13/16versus11/16;
one old loss, so fixed gate FAIL. All3wrong ranks confuse400g/750gNutella. No
threshold calibration, automatic accepts, app model switch, phone update or push.
Exact evidence/latency/RSS/limits in DINOV2_COMPARISON_RESULTS.md.

Next executable action is exactly docs/project/NEXT_ACTION.md: targeted variant
recovery with readable size/barcode, not guessed identity. Broader data/device/
Android/update work remains; local engineering has not been exhausted.
