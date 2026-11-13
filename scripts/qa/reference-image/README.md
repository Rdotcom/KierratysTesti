# Experimental reference-image QA

This directory is tooling, not a shipped/default product catalogue.

`off-initial-selection.json` is a November 13, 2026 source-reported selection of
five grocery products and 21 proposed original front-image uploads. All reviews,
capture independence and evaluation splits remain unresolved. No images or
features are included. Do not import it into the app or convert pending fields
to acceptance automatically.

Product data: Open Food Facts contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/);
individual contents: [DbCL 1.0](https://opendatacommons.org/licenses/dbcl/1-0/).
Source record URLs, exact response hashes, contributor credits and access date
are retained in the JSON. Proposed images are separately CC BY-SA 3.0 according
to the [official licence guide](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/),
not covered by a source-code licence. No source image is redistributed here.

To create a **new ignored preparation snapshot**, first create a fresh directory
under `work/`, then run:

```sh
node scripts/qa/reference-image/prepare-off-candidates.mjs work/<new-run>/off-candidates.json
```

This makes five serial bounded keyless API reads, never image requests, and
refuses to overwrite an existing snapshot. It does not update the committed
selection, perform inference, assert human review, select a query split or
authorize integration. See `docs/research/reference-product-selection-2026-11-13.md`.

The completed V1/V2 experiment scripts and their original freezes/ledgers remain
historical evidence. Do not rerun them as independent product testing or modify
their old locks to incorporate new source files.

## Byte-adapter integration smoke

`node-runtime-ports.mjs` supplies real Node SHA256 and a bounded single-frame
JPEG/PNG decoder policy through an explicitly trusted caller-supplied Sharp.
It rejects oversized originals and does not access URLs/files or implement
mobile camera preprocessing, cancellation or performance guarantees.

`runtime-byte-smoke.mjs work/<new-directory>` is an optional local integration
check. It requires the retained November12 decoder freeze and exact installed
artifacts; absence/drift fails rather than downloading or relaxing pins. It
freezes current source, bundles the public experimental entry, generates three
synthetic PNG encodings in memory and checks actual hash/decode/feature/receipt
binding plus query exclusion. Every accepted identity/capture field is explicitly
a synthetic test fixture, not real human or independence evidence. It records
counts/hashes under the new ignored directory and never enables integration.
The November13 completed result does not need repeating. See the final report.
