# Free object images and clean-copy lineage — November 16, 2026

Scope: five new Wikimedia Commons source images for local development review,
not manufacturer/material truth, Finnish-product coverage or physical phone tests.
No model inference/training, app change or public image redistribution performed.
Membership of these public images in pretrained models' training data is unknown;
they cannot establish an independent unseen-image generalization claim.

## Source research and actual acquisition

Read [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:First_steps/Reuse/en)
and individual file pages on2026-11-16. The API is used for imageinfo/extmetadata;
media licences are per file, not the Commons site-wide text licence. Preserve
attribution/ShareAlike where relevant. Do not use a search snippet as permission.

All five API metadata snapshots and JPEG responses were actually acquired under
bounded fixed-host HTTPS requests,20s/request,no redirects/no automatic retries.
Use upstream1280px display renders where provided to stay within decoder limits;
these are derivatives of the Commons original, not independent captures.
Maximum5images/4MB each and5metadata snapshots/1MB each. Exact bytes,author HTML,
licence URL,source URLs,page IDs and access date are retained in private JSON.
No HTML is rendered as trusted UI. Individual raw fields may contain additional
third-party claims; they are not verified material labels.

| ID | Source / credit / offered licence | Actual visual review and intended role |
| --- | --- | --- |
| commons-1 | [Ceramic mug](https://commons.wikimedia.org/wiki/File:Ceramic_mug.jpg), NNU-11-Zaclee, CC BY-SA3.0 | Two printed mugs on boxes. Not a text-free single-cup positive; retain as multi-object/printed-scene recovery case |
| commons-2 | [Wooden Spoon](https://commons.wikimedia.org/wiki/File:Wooden_Spoon.jpg), Donovan Govan, CC BY-SA3.0 | One spoon on wooden slats, no visible text; useful spoon-form development candidate, material remains a source claim |
| commons-3 | [Spoon-20080714](https://commons.wikimedia.org/wiki/File:Spoon-20080714.jpg), Susanlesch, CC BY3.0 | Bent spoon, no visible text; useful shape/damage stress candidate, no exact alloy/material claim |
| commons-4 | [Wooden Spoon and Fork01](https://commons.wikimedia.org/wiki/File:Wooden_Spoon_and_Fork_01.jpg), PagesAndPathsPH, CC0 | Spoon and fork together; multi-object candidate, not a single-spoon acceptance image |
| commons-5 | [White mug with coffee](https://commons.wikimedia.org/wiki/File:A_white_mug_filled_with_warm_coffee.jpg), page/API Shixart1985, CC BY2.0 | One cup containing coffee, no visible product text. The source page also credits photographer Nenad Stojković in EXIF: retain both credits and this discrepancy before redistribution/enrollment; not an empty packaging or verified ceramic sample |

The five actual images were viewed, not merely labelled from filenames. No person
or private text was observed in those five images. This limited observation is
not a general privacy guarantee for the whole historical corpus. Material values
are unknown in the acquisition record. No separate human-reviewer gate reinstated.

Smithsonian spoon page returned404 through the research fetch; not acquired.
A Science Museum wooden-spoon image offered CC BY-NC-SA, so was not selected
for this commercial-compatible development pool. These are retained research
limits, not reasons to bypass licensing or fetch from an unverified mirror.

## Implemented clean-copy pipeline

`scripts/qa/object-development-import.mjs` writes only a fresh private `work/`
directory, never overwrites originals, outputs or past receipts. It authenticates
historical source manifests and binds source-evidence hashes; clean copies retain
parent ID, object/family, split, pool, original/image/evidence hashes, binary/source
identity and transformation recipe. Reusing already acquired source bytes validates
their hashes/credit joins and does not silently reacquire them.

Actual run parent: `work/object-clean-20261116.oaxGJU/`:

1. `dataset/`:4newacquisitions plus93existing source images. First cleaner attempt
   retained97failures because ImageIO inserted EXIF into newly encoded PNGs.
2. `clean-v2/`: strict PNG ancillary stripping removes real EXIF, but old broad
   metadata detection still rejects97copies. No new downloads; failure retained.
3. Fix actual-container detection: ImageIO can synthesize descriptive tags even
   when PNG has only IHDR/sRGB/IDAT/IEND. Parse real PNG/JPEG metadata blocks rather
   than treating the existence of an ImageIO metadata object as an embedded block.
   Do not relax rejection of actual EXIF/XMP/IPTC/comments. Historical conservative
   flags remain recorded; they were not proof of personal data or actual EXIF.
4. `clean-v3/`:97/97copies pass with0metadata flags, prior source acquisitions reused.
5. `clean-v4/`: acquire exactly one additional coffee-cup source, retain earlier4;
  98originals total (93historical+5new),98clean PNGs,0cleaning failures.

Actual native binary is `image-audit-v3`, SHA256
`06de8de6f776a35c5801235ce7e551efe29ca5c85352e5c289a4351588291b26`.
Swift6warnings-as-errors compile passes. PNG chunk stripping validates lengths,
critical chunks and CRC32; keeps image data/essential colour chunks and removes
text/EXIF/other ancillary payloads. New copies are normalized sRGB/orientation;
no crop, new scene, generated label or independent-capture claim.

Actual native checks: injected JPEG comment is detected; cleaned PNG has no
container metadata; source and clean canonical pixels agree. All98parent/child
pairs in the final audit have identical canonical pixel hashes. Source bytes are
re-read and unchanged after cleaning. No raw metadata values printed in QA logs.

## Actual cross-batch audit

Final `clean-v4/file-audit.json`:196images decoded,27actual metadata flags on
originals only,98expected parent/child duplicate-pixel pairs,4near-review pairs.
Old Sharp cache pins are unchanged and remain unusable after their detected
native-artifact drift. This uses a separately identified ImageIO decoder, not a
replacement of historical model preprocessing/evidence.

Split actual receipts into historical and newly acquired groups and aggregate
globally. `clean-v4/global-audit.json` checks all196rows/receipts, complete parent
graph and shared object/family/byte/pixel groups across splits/pools.19,012
non-parent-pair dHash comparisons:4near-review pairs,0global cross-split findings.
The4pairs are the old case011/case018 scene and its cleaned combinations; copies
do not manufacture additional independent evidence. More than2,000receipts flags
near-scan incomplete rather than pretending the quadratic scan finished.

No cross-split finding does NOT prove capture independence. Metadata on originals
is retained/quarantined; only verified clean children are model-input candidates.
Source/clean expected duplicate pairs stay recorded and never count twice in
evaluation. Generic source-file hashes do not certify legal rights/material truth.

Read-only reproduction on the retained final artifacts:

```sh
node scripts/qa/object-development-import.mjs --aggregate work/object-clean-20261116.oaxGJU/clean-v4/combined-manifest.json work/object-clean-20261116.oaxGJU/clean-v4/file-audit.json
node --test scripts/__tests__/object-development-import.test.mjs
```

Aggregate CLI emits the same global checks over the full combined file, exit2
for retained original metadata/near-review flags, not a falsely green quality pass.
The earlier actual two-group call used the same exported `aggregateLineage`
function after partitioning IDs into historical and Commons groups. Reports are
declarations: independently re-run byte audit when files/decoders change. The
stored transform receipt pins the exact importer bytes used before subsequent
formatting/CLI additions; later source bytes must not be substituted in that receipt.

## Evidence and remaining work

18newregressions test approved host/licence selection, missing credits, PNG
metadata/CRC/truncation handling, cross-batch duplicates/family leakage, parent
joins and tampered/missing receipts. Initial test-fixture default accidentally
replaced an absent licence; fix test to actually remove the licence and rerun.
All failure journals remain; no published dataset/model/phone quality claim.

Next: register a bounded **development-only** model smoke comparison using the
visually reviewed text-free source candidates plus multi-object/printed-scene
controls, with frozen class prompts/model pins/unknown outcomes. Keep this distinct
from the unpopulated12class/fourdevice physical quality protocol. More web images
can improve development coverage, but cannot demonstrate real iPhone/Samsung
camera accuracy, hidden material truth or complete Finnish market coverage.
