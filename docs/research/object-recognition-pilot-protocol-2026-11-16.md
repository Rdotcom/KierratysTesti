# Object recognition pilot v1 — preparation contract

Roope approved the bounded scope and feasibility experiment on November 16
(“jooo” following the research proposal). Universal all-product certainty is not
an acceptance requirement we claim to satisfy. No paid training, model promotion,
app replacement, photo upload or GitHub publication is authorized by this step.

## Executable preparation

```sh
node scripts/qa/object-recognition-dataset.mjs scripts/qa/local-vision/object-recognition-pilot-manifest.json
node --test scripts/__tests__/object-recognition-dataset.test.mjs
```

CLI exit 1 = invalid/rejected metadata; 2 = valid but incomplete collection;
0 = declared collection metadata complete, **not permission to infer or release**.
`inferenceReady` and `releaseReady` remain false even for a fully populated file.
The checked-in real manifest is deliberately empty, not filled with fake photos.
Synthetic test metadata exists only in the validator regression test.

## Scope and grain

Twelve classes: cup, spoon, cutlery, dish, bottle, jar, can, carton, bag-wrapper,
battery, small-electronics, textile. These are object forms, NOT materials or bins.
Known objects require physical-observation or manufacturer-record class evidence.
Outside-class objects have null class, split calibration/test; risk controls are
test-only and can have a known class or null. No AI-inferred truth labels.

Per known class: 30 train / 10 calibration / 10 held-out physical objects.
Unknown objects: 100 calibration / 100 test. Risk controls: 100 test. Total target
900 objects, not an accuracy sample size claim. Four explicitly registered device
tiers: older/newer supported iPhone, Samsung A and Samsung S. At least three
different captures per object/device: 10,800 target image rows. This resolves the
research proposal's distinction between three views per device and independent
objects. It is a substantial target, not a claim data already exists.

The experiment uses all four tiers to avoid deferring the low-end/parity risk to
release. No actual model numbers/OS floors are fabricated: register real available
device models before capture. A larger dataset is needed if confidence intervals
remain too wide, especially per class. Multiple photos or device views of one
object do not increase the count of independent objects.

## Metadata contract and collection instructions

Every image row requires exact fields shown by `auditDataset`:

- Non-personal opaque IDs: id, objectId, sessionId, sourceFamily. Group all
  derived images and common original captures consistently. Do not encode names,
  locations, filenames with personal details or model-predicted answers in IDs.
- split, role, classId; SHA256 of the actual captured bytes; deviceTier,
  deviceModel, osVersion, condition, textVisible. These are declarations until
  the next byte-backed import phase verifies the files. Do not invent missing hashes.
- classEvidence.kind/reference; material.value/status/reference. Unknown material
  must be null/unknown/null. Non-null material requires manufacturer-record or
  physical-marking evidence. A class observation is not a material observation.
- rights.license/reference and privacyChecked true only after actual rights and
  privacy inspection. Schema acceptance does not certify legal rights or absence
  of EXIF/private content. Do not submit private photos to chat or external services.

Photograph one ordinary object from different angles, with varied lighting and
background. Include naturally text-free cups and utensils in the test set; visible
branding is not a substitute. No people, documents, addresses or identifying
backgrounds. Do not handle/open dangerous items to collect this dataset. Battery/
electronic/chemical risk controls need safe, documented observation only.

The auditor rejects duplicate IDs/declared hashes, any object/session/source-family
crossing splits, changed class/material truth for one object, unregistered fields,
invalid roles/classes and invented material statuses. It counts physical objects,
not image rows, for split completeness. It reports unknown material separately.
At least ten naturally text-free held-out objects per cup/spoon/cutlery/dish class
are required. Current version checks at least one declared text-free view per
object; full per-device text-free coverage will need the byte/capture review.

## Before any model execution

This tool validates metadata only. A separate byte-backed importer must verify
file containment, no symlink traversal, read limits, JPEG/decoded format, hashes,
metadata/privacy handling, original/derived lineage and exact/near-duplicate risks.
Source-only downloaded examples belong to a separate development pool, never
physical held-out evidence. Model receipts must not expose held-out labels to
fit/calibration. Truth/rights/physical identity remain assertions to substantiate.

Then register exact model/preprocessing/quantization hashes, frozen prompt and
threshold settings, data hashes, one canonical attempt and all failures before
unlocking the test. Compare only current MobileCLIP baseline and one SigLIP2
candidate initially. All proposed gates are exported in `protocol` for the later
evaluator, but this preparation checker does not evaluate those gates or model
accuracy. Do not interpret numeric constants as achieved results.

Existing SKU failures remain unchanged. Minimum accepted precision 99%, known
coverage 70%, unknown false acceptance at most 1%; no critical unsafe sorting
recommendation; stronger model requires at least 10 percentage-point paired
correct-coverage gain without more false/unsafe results plus device limits.
Report confidence intervals/grouping limitations before release. Zero accepted
decisions is not 100% precision. New class-level criteria do not erase old SKU gates.

Independent barcode scanning is untouched and must have its own native regressions.
No image-to-bin shortcut, cloud fallback or known-material default is permitted.
No extra human-reviewer gate is reinstated; genuinely missing evidence stays missing.

## Current outcome

Real manifest has zero rows and collection is incomplete. The auditor correctly
returns exit 2 and no inference/release readiness. Twenty-two synthetic automated
regressions pass; none is a recognition accuracy or phone test. The data-quality
skill influenced grouped counts, missingness, leakage and source-truth separation;
it did not supply photos or verified labels.

Next locally executable step: implement a safe byte-backed import/lineage audit,
keeping prior licensed source images explicitly development-only. Do not wait for
the entire physical collection to build that tool, and do not relabel old images
to fill the new held-out dataset.
