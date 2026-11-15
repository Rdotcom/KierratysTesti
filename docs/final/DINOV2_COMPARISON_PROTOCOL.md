# DINOv2-Small retrieval comparison — protocol v1, 2026-11-15

Freeze before first model forward. This is a QA-only end-to-end encoder comparison,
not a mobile-model switch, acceptance calibration or an independent release test.

## Hypothesis and fixed decision

DINOv2-Small CLS descriptors may separate product appearance better than current
MobileCLIP-S0 full-frame descriptors. Useful improvement requires at least14/17
known top1 source agreements, zero losses among the baseline11correct rows, and
all68encodes complete. PASS only authorizes considering a separate mobile parity
experiment, never automatic identity/sorting or release. Failure remains recorded.
No retry, query-dependent crop/threshold/model tuning or deletion of failures.

## Data, baseline, architecture

- Exact existing allocation lock SHA256
  efdf65ee638595cedc176029138194afc8e10b20920ad0003c897c7444dfa67e:
  10references/17known/41safety-audit JPEGs. Preserve source/role/hash/family/label,
  all five pilot IDs and historical exposure/independence limitations. No new
  images, source metadata, ground truth, augmentation or training.
- Existing integrated MobileCLIP results/lock are pinned. Baseline11/17includes
  case002timeout; report paired16successful-known separately and preserve the
  all17denominator. Neither replaces the older OCR/max-margin acceptance gates.
- Official facebook/dinov2-small revision
  ed25f3a31f01632728cabb09d1542f84ab7b0056, 88249960byte safetensors SHA256
  ae1e99fcefd534ed978cdeb8326f08030c96e28b7a81ffcbc98a857c84d14be1.
  No pickle, remote code, hub runtime fetch, GPU or trained classifier.
- CPU float32/eval/inference_mode, deterministic operations,2threads. Global CLS
  from final layer,384values, L2normalization. Same reference/query preprocessing:
  EXIF orientation baked, RGB, bicubic shortest-edge256(integer floor otheredge),
  centered224crop(integer floor offset), float32rescale1/255 and ImageNet
  mean[.485,.456,.406]/std[.229,.224,.225]. PIL12.0.0 and NumPy2.3.4 locked.
  This explicit variant follows the model processor configuration; do not claim
  bitwise HuggingFace processor parity without a separate check. MobileCLIP uses
  its original256letterbox, so the comparison includes preprocessing differences.
- Cosine maximum of two references per SKU; deterministic product-ID tie break.
  Report full top5lists/margins for every query, top1/recall5/allfivepilots/oldlosses.
  Five enrolled classes make recall5 structurally weak. Audit nearest neighbours
  are diagnostics, NOT accepted identities; no false-accept precision is inferred.

## Execution and safeguards

Pin runner/reviewer/protocol/wheel lock/model files/all68images/baseline before
inference. Claim exclusive canonical attempt ledger. Model load once, no warmup
images, one forward per image in reference-then-query allocation order; individual
failure retained without replacement. Per-image60sdeadline, process15minouterbound,
input16Mpixel/8MBbound. No reference failure silently shrinks gallery.

Run the actual Python process via sandbox-exec(deny network*) and verify a controlled
HTTPS probe fails under the same policy. HFoffline/telemetryoff, local_files_only,
use_safetensors, trust_remote_code=false. Dependencies isolated under ignored work/;
39official PyPI wheel hashes locked, all at least24h old at preparation. No secrets.

Exclusive raw vectors/receipts, per-image duration, model-load time and maxprocess
RSS. RSS and persistent-process CPU timings are Mac measurements, not comparable
phone power/latency nor directly the previous per-request native process budget.
Independent Node implementation recomputes every vector norm/cosine/rank/metric
and verifies all source/input identities without invoking models. Test missing,
duplicate, tampered/nonfinite/unnormalized data and failure-denominator handling.

No app dependency, catalogue vector, native model, thresholds, UI or phone changes
follow automatically. Apache2model/software provenance retained with downloaded
artifacts; OFF source image/descriptor attribution unchanged. Public NO-GO persists.
