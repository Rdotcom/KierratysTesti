# First exact-product reference selection

Accessed November 13, 2026. Roope delegated the first product selection to
engineering. This is an acquisition plan, not an accepted recognition catalogue.

## Bounded starting scope

| Source-reported product | Source-reported size | GTIN |
| --- | --- | --- |
| Nutella | 400 g e | 3017620422003 |
| Nutella Nuss-Nugat-Creme | 750 g | 4008400404127 |
| Coca-Cola Original | 330 ml | 5449000000996 |
| Barilla Spaghetti Nº5 | 500 g | 8076800195057 |
| LU Prince | 300 g ℮ | 7622210449283 |

Five ordinary groceries provide a deliberately small named-product scope with
different package appearances. The two Nutella sizes deliberately test shared
branding versus exact SKU identity. Their source records do not prove that a
Finnish physical package is identical. Availability in every Finnish shop,
materials and deposit eligibility are **not** asserted. Brands/names/quantities
are community-reported, not verified by us.

The committed `scripts/qa/reference-image/off-initial-selection.json` contains
source record URLs, access date, exact limited-response SHA256s, selected-image
parent IDs and original contributor credits. Five serial official API reads
produced the final snapshot; seven earlier exploratory reads found two missing
records and clarified names. A guessed name was never used as a label.
No image was downloaded, decoded, inferred on, trained on or human-accepted.

## Licence and acquisition boundary

- [OFF's official licence guide](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/)
  distinguishes ODbL database, DbCL contents and CC BY-SA product images. Its
  image licence link currently resolves to CC BY-SA 3.0. Keep the selection data
  separate from source code and retain Open Food Facts contributor attribution.
- [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
  requires attribution and ShareAlike for adaptations; other rights can remain.
  The importer now records modification notice and same-licence redistribution
  explicitly. That does not grant privacy, trademark or owner approval. No image
  or descriptor distribution is authorized by this source-selection document.
- [OFF image structure](https://openfoodfacts.github.io/openfoodfacts-server/api/how-to-download-images/)
  identifies the original upload through `imgid`. Crops, resolutions, language
  views and revisions from one upload are not independent photographs. There are
  **21 distinct selected-front upload IDs**, not 21 verified independent captures.
  Even distinct uploads may be duplicates or unsuitable views.
- [Official AWS image dataset](https://openfoodfacts.github.io/openfoodfacts-server/api/aws-images-dataset/)
  is the documented path for larger image acquisition. The plan uses anonymous
  400px object URLs, not credentialed or requester-pays operations. Monthly sync
  can leave objects absent. Do not replace a missing object with an unrecorded
  server retry or scrape restricted pages.

The terms page returned a bot notice and the wiki licence summary denied access.
Do not bypass those controls or claim those pages were reviewed. The accessible
official developer guide and Creative Commons deed support this preparation;
owner distribution/attribution acceptance remains pending.

## Required before release testing

Review each physical identity/GTIN and each proposed image's identity, rights,
privacy, duplicate lineage and suitability. Upload timestamps are not capture
dates. Do not invent a capture date, accepted review or independent split to make
the importer pass. Obtain genuinely separate enrollment and query captures,
including near-identical size/flavour variants and unlisted/mixed/obscured
objects. Freeze the query protocol before matching; retain every rejection/error.

All snapshot reviews remain `pending`, capture independence `unverified` and
split `unassigned`. The app imports none of this dataset. Candidate similarity
cannot establish exact GTIN, hidden packaging materials or a sorting answer.
