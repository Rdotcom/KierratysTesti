# Data and licensing

## Active sources

- November13evening:21public OFF originals/metadata-free review derivatives are
  acquired privately, not shipped or committed. Preserve full CC BY-SA3.0
  image/ODbL/DbCL source attribution coordinator-side and explicit unapproved
  reviewer preparation. No accepted identity, capture independence, lawful
  distribution or human review is claimed. Actual development diagnostic and
  seen-output safety replay remain separate from source truth and release
  acceptance; details in OFF_RELEASE_READINESS_RESULTS. No user photos/cloud
  upload or payment is used. The existing source-only selection JSON remains
  data rather than app inference truth.

- November 13 reference preparation: `scripts/qa/reference-image/off-initial-selection.json`
  contains five source-reported OFF products/21 proposed front-upload identities,
  not images, features or accepted labels. Preserve ODbL/DbCL attribution and the
  original uploader credits. Proposed images are CC BY-SA 3.0 per the accessible
  official licence guide; the experimental importer requires a modification
  notice and same-licence redistribution field. All rights/privacy/identity
  reviews remain pending, no independent split is asserted and no asset is
  shipped to the app. See `docs/research/reference-product-selection-2026-11-13.md`.

- Open Beauty Facts, Open Pet Food Facts and Open Products Facts: free public lookup through the official universal routing API, with source-specific ODbL 1.0 attribution and community status. No bulk dataset mirror/merge or sibling-project images. The generic connector ID is `open-facts`; displayed source and licence come from the actual database's field provenance. Publisher catalogue/licence links and implementation evidence: `docs/research/free-data-sources-2026-10.md`. OWNER/LEGAL REVIEW REQUIRED before publication.
- OpenStreetMap contributors: complete separate ODbL 1.0 Finland point snapshot, 5,753 retained records imported October 6. `apps/mobile/assets/data/README.md` includes rights/refresh/coverage notes, with the full normalized database and transformation script available in the repository. The app shows attribution, retrieval date, stale-data and real-world uncertainty; user coordinates are never included in the dataset. No map tiles/photos/OSM logos are reused. OWNER/LEGAL REVIEW REQUIRED for final distribution and attribution review.

- Open Food Facts product database: ODbL 1.0; database contents DbCL; product images CC BY-SA as represented in field provenance. Community accuracy/completeness is not guaranteed. UI identifies Open Food Facts, combined database/content licence, attribution, retrieval date and community status. The owner must still complete the current OFF account/API-usage/contact steps and legal review before publication.
- Suomen Pakkauskierrätys RINKI Oy: linked/paraphrased nationwide packaging instructions for plastic, carton/paper, glass and metal, checked 2026-08-10.
- Suomen Palautuspakkaus Oy (Palpa): linked/paraphrased deposit-system instructions, checked 2026-08-10.

Production publication still requires owner/legal review of attribution presentation, caching/database-right implications, share-alike boundaries and text reuse. External fields are not flattened into an unattributed “truth”; each observation stores source record, timestamp, licence, confidence and status.

## Unavailable integrations and recognition scope

- GS1 Data/Synkka: `MockGs1DataProvider` is synthetic, marked `mock`, responds only to a fixture GTIN, is not composed by the API and is absent from the production API bundle. GS1 Finland's 2026 transition to GS1 Data makes current written terms/access mandatory; no GS1-derived product record or partner claim exists.
- Kierrätys.info/KIVO: no API key or commercial-use agreement; no scraping fallback.
- Municipal sorting rules, route calculation and map imagery: not active. OSM point coordinates do not establish municipal policy, material acceptance, opening hours or entrance/access verification.
- App photo/OCR source: local iOS Vision/MobileCLIP observations and a separately
  consented optional server-side OpenAI path are implemented; the last approved
  development server has cloud recognition disabled. Neither estimate verifies
  materials/identity. Own pixel-reference code is experimental/unwired; there is
  no accepted/shipped exact-product photo catalogue. Detailed model/notice and
  consent boundaries are in the local-vision/photo reports, not this old list.

Sorting content has a stable code/seed version `fi-rinki-2026-08-10.1`; database rule versions are immutable once published. A content owner must schedule recurring source review and publish replacements with effective dates.
