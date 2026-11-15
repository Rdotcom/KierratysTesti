# Offline catalogue attribution and reuse

`offline-product-catalogue.json`, version `off-five-2026-11-14-v1`, is a separate
derived database from Open Food Facts contributors, accessed 2026-11-14.

- Product metadata: Open Database License (ODbL) 1.0; individual contents DbCL 1.0.
  <https://opendatacommons.org/licenses/odbl/1-0/>
  <https://opendatacommons.org/licenses/dbcl/1-0/>
- Each of ten image-derived numerical descriptors retains its contributor,
  original-image URL, checked date and source hash. Conservatively distributed
  as adapted image material under CC BY-SA 3.0:
  <https://creativecommons.org/licenses/by-sa/3.0/>.
- Modifications: select five source records; retain exact reported names,
  brands and quantities; leave unavailable attributes null; encode ten source
  images using the pinned Apple MobileCLIP-S0 full-frame pipeline. No original
  photograph is included in the catalogue. This is not independent product or
  manufacturer verification, Finnish-market coverage or endorsement.
- The complete derived database/descriptors and preparation script are supplied
  in the source tree. Preserve these notices, source metadata and share-alike
  requirements when distributing this data; the application's separate source
  code is not thereby relicensed. Model code/weights keep their own notices in
  the native model resources.

Build: `node scripts/qa/build-offline-catalogue.mjs <compiled-native-cli>
work/<new-output>`. The importer requires authenticated source snapshots and
original bytes described in its pinned input allocation. It never fetches them
at runtime and never treats duplicated/resized images as independent captures.

Installed catalogues are immutable deployment assets; reinstalling a previous
compatible app is rollback. A remote updater, signed update manifest, SQLite
migration and automatic download are deliberately NOT implemented or claimed.
