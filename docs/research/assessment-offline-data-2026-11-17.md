# Assessment offline-data acquisition and limits

Acquired16NovemberUTC; reviewed17November2026Europe/Helsinki. Stable HSY API
research is reused from `hsy-prod-api-verification-2026-11-16.md`, not repeated.

## Sources and rights

- HSY official1.0.4PROD endpoint:
  `https://prod.klapi.hsy.fi/int2001/v1/waste-guide-api/waste-pages`.
  [Official open data](https://www.hsy.fi/ymparistotieto/avoindata/avoin-data---sivut/jateopas-paakaupunkiseutu/),
  [CC BY4.0](https://creativecommons.org/licenses/by/4.0/).
  Owner-authorized dedicated PROD credentials loaded only into local importer;
  fixed official HTTPS header request, no credentials in mobile or Git. FI and EN
  pages are normalized in the backend provider, consumed through a shared schema.
- [Open Food Facts API policy](https://openfoodfacts.github.io/openfoodfacts-server/api/),
  [official local-cache guide](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/creating-a-local-cache-of-open-food-facts-data/)
  accessed16November2026. A few-hundred-record request is bounded, not a bulk
  crawl. Larger databases should use dumps/exports, not API harvesting. OFF
  database ODbL1.0 and individual contents DbCL1.0. Keep the OFF database file
  independent of HSY and other content; retain source attribution/share-alike.
  No source images downloaded or bundled in the barcode library.

## Actual records, not inferred completeness

HSY source reports751FI /731EN rows, with62/11identical repeated IDs across
pages. Conflicting IDs fail closed; identical repeats deduplicate, not silently
discard a conflict. Observed joins yield658bilingual IDs;31FI IDs lack observed
EN pairs,62are EN-only. These are not guaranteed full catalogue counts. One EN
record has missing reception details and explicitly displays a source-translation
warning. Null receiver titles are not invented or translated by guessing.

HTML becomes bounded plain text; script/style bodies, unsafe URLs/control and
format characters are removed.107editorial CMS markers removed; explicit two
English heading-label repairs, no policy prose rewritten. All reception choices
retained rather than pretending the first one is always appropriate. HSY-area
selection is mandatory; no nationwide inference. Snapshot immutable until a
reviewed refresh; source check is not an independent policy/recognition review.

OFF source country-tag filter returns100records on page1despite initial300limit;
page2request fails HTTP/content-type assertion, retained without guessing status
or retrying it. Page3returns100. Of200rows,199pass GTIN/name/country validation.
Source count21625is NOT the shipped offline size and country tags are community
assertions, not verified Finnish-market coverage. Product trade names remain
source names even where an upstream English field contains a Finnish trade name.
No material, deposit or sorting rule is inferred from names.

## Pins and reproducibility

| Separate shipped asset | Records | Bytes | SHA256 |
| --- | ---: | ---: | --- |
|mobile/app/assets/data/hsy-guide.json |658 |1316021 |9a25a61d44f8e491f17680bd3dd728364c1db1997f829bdafff43a96322d43ee |
|mobile/app/assets/data/off-finland-barcodes.json |199 |26690 |09bdb6aff5e617fa56e55286c44c41ca669f73a3f59306e3f68485a6a2470ddb |

Pre-staging HSY source SHA256:
`c276799ab67237295a556bebd8a546f8f9261682e58168bf6ecf80a229f1db0c`.
Source caches/failed attempts are retained in ignored work folders, never required
by runtime. Checked-in sanitized snapshots allow normal source builds without
HSY credentials. Generated native recognition assets still have their previously
documented clean-checkout reproducibility limitation.

Refresh procedure: create a fresh work directory; run
`node --env-file=backend/api/.env.hsy.prod.local scripts/data/acquire-hsy-guide.mjs work/FRESH`;
then `node scripts/data/stage-hsy-guide.mjs work/FRESH --write`; review source
counts/translation/region/rights/diff and update pins only after validation.
Do not run this on app launch or print the env file. Public OFF importer is
bounded to3pages; use a dump for a materially larger maintained database.

Receipts: `work/assessment-hsy-v4-20261116.FmxrH4/hsy-acquisition.json`,
`work/assessment-20261116.6vkR22/{off-acquisition,off-acquisition-3}.json` and
`work/assessment-20261116.6vkR22/hsy-stage-v3.log`. Earlier failure logs remain, not substituted
with a claim of complete source coverage.
