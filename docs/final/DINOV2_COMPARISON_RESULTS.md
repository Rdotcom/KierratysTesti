# DINOv2-Small comparison — 2026-11-15

Actual inference completed. Predeclared improvement gate FAIL; public NO-GO.
No app model/catalogue/acceptance switch. Integration commit9d41906 remains.

## Evidence

Private run: `work/dinov2-comparison-2026-11-15.gkByIM/evaluation/`.
Lock SHA256 `1469cf8c455504f3a101b6a1e88f791c57c4319be08bb8b5d547f2b9b23ea185`;
raw SHA256 `da42d90405b5c394119262eab3785106fde1ec34d83e4de3820ff5d6eab98a2b`.
10original references + all17known/41audit images,68real DINOv2forwards,
384-dimensional L2 CLS descriptors; no synthetic model outputs or training.
MobileCLIP returns reused, no native query repeated. Source labels/families/
seen-image/nonindependence limitations remain attached.

Downloaded only pinned official safetensors/config/processor/card and original
Apache2licence; weights88249960bytes.39hashed PyPI wheels in isolated ignored
QAvenv, no app dependency change. No pickle/remote code. Actual Python runs under
OS `(deny network*)`, local-files-only/huboffline/telemetryoff; identical controlled
curl probe returns6/no body. Preparation download is separate from inference.
Node-only reviewer authenticates83pins/all68byte-vector joins and independently
recomputes all per-SKU cosines/ranks/metrics with0model calls.

## Results

| Measure | Actual result |
| --- | --- |
| All-known top1 source agreement |DINO14/17(82.4%); MobileCLIP11/17(64.7%) |
| Paired successful-known rows |DINO13/16; MobileCLIP11/16 |
| Baseline failure |case002native timeout retained; DINO rank correct |
| New source agreements |case002,case014,exp009,exp021 |
| Lost prior agreement |exp003:400gNutella source ranked as750g |
| Remaining wrong-source ranks |case011,case018,exp003; all400g→750g |
| Recall5 |17/17, only5enrolled SKUs; structurally uninformative |
| Pilot top1 |4/5,exp003fails; not older exact-acceptance pilot metric |
| Encode failures |0/68 |
| Safety audits |41diagnostic rankings; no acceptance classifier evaluated |
| Automatic accepts / precision |0 / undefined; no calibrated false-accept bound |
| Fixed gate |FAIL:≥14 achieved, zero-old-loss requirement fails |

82.4%is not accepted precision or population accuracy. The reused five-SKU
development set is neither500known nor100–200independent unknown products nor
a prospective holdout. No thresholds were selected against these ranks. Older
failed OCR/max-margin gates remain. No automatic identity/sorting activation.

MacM1/8GiB resident CPUfloat32: decode/preprocess/forward p5042.03ms,p9553.33ms,
max328.16ms,n68including10references. Model-load173.60ms excludes Python/import
startup. MaxRSS452198400bytes(~431.3MiB). These are NOT phone/NeuralEngine/cold-
start/battery measures or directly comparable to previous separate-process native
requests. No CoreML/Android conversion/parity has been performed.

## Failure diagnosis, not post-hoc repair

Observed exp003photo shows Nutella branding but no readable size; both cached
OCRviews return only“nutella”. Wrong750gbeats400gby0.01266. Correct750gexp009
margin is only0.00037, so rank margin is not validated confidence. Never invent
size from jar shape. Case018visibly has400G; cached OCR reads400G+nutella and
current app already gives a confirmation-only400g hint despite wrong visual rank.
Case011OCRreads400G+nutelld, causing strict full-name abstention. This supports
targeted variant recovery/text corroboration, not relaxed thresholds or a pass.
No queries rerun after inspecting outcomes.

## Checks and reproduction

Five deterministic regressions pass: descriptor validity, stable per-SKU ranking,
complete gallery, paired/failure denominators, lost-agreement gate and offline/
safetensors/deadline policy. Actual repeat refuses at canonical ledger before
new output/model work. Full1819tests/allchecks/builds pass; TEST_EVIDENCE.md has
logs. Exclusive receipts remain; do not reset ledger to retake this experiment.

```sh
node --test scripts/__tests__/dinov2-comparison.test.mjs
node scripts/qa/dinov2/review.mjs work/dinov2-comparison-2026-11-15.gkByIM/evaluation
pnpm validate
```

A later hypothesis needs a new protocol and disclosure of development-set reuse.
Existing app remains FUNCTIONAL BUT NOT PRODUCTION-VALIDATED; larger catalogue,
Android, safe updates, variant/open-set quality and physical acceptance remain.
