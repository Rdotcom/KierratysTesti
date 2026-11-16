# HSY PROD API verified — November16, 2026

Primary public sources accessed2026-11-16:

- [Official HSY open data](https://www.hsy.fi/ymparistotieto/avoindata/avoin-data---sivut/jateopas-paakaupunkiseutu/):
  REST/JSON, CC-BY4.0, monthly refresh, account required; not nationwide policy.
- [HSY access/API instructions](https://avoidatastr.blob.core.windows.net/avoindata/AvoinData/2_Jatteet_ja_kierratys/Jateopas/HSY%20J%C3%A4teopas%20-%20ohje%20apin%20k%C3%A4ytt%C3%B6oikeuden%20hakuun.pdf):
  header credentials, separate DEV/PROD grants/data; no DEV promotion.
- [Official public API portal](https://eu1.anypoint.mulesoft.com/exchange/portals/hsy-1/9626b427-a0cb-470c-af8a-665710ba69fa/waste-guide-api/):
  version1.0.4, public PROD instance and downloadable OAS3.0.1. Public HTML's
  base64-JSON bootstrap parsed as data, never executed. Read-only anonymous
  discovery, not account/session scraping. No expiring signed download links or
  bootstrap bodies are committed.
- Stable public specification download:
  `https://eu1.anypoint.mulesoft.com/exchange/files/api/v1/organizations/9626b427-a0cb-470c-af8a-665710ba69fa/assets/9626b427-a0cb-470c-af8a-665710ba69fa/waste-guide-api/1.0.4/fat-oas/zip?source=Exchange%20UI`.
  ZIP2entries/14011uncompressed bytes; YAML13561bytes SHA256
  `df258e481f59ed92ac0ad9f40609280e02733c212b9edf69956dadecc82483ae`;
  ZIP SHA256`a9c76df2d43d78b1cc155bd4e16bd8842ca9645212d107256f5213b37ca39460`.

OAS explicitly declares `https://prod.klapi.hsy.fi/int2001/v1/waste-guide-api`;
do not guess from the PDF's DEV examples. `client_id` and `client_secret` are
header apiKeys, never query fields/mobile values. GET waste-pages accepts page≥1,
pageSize1–100, lang fi/en/sv and search/wasteType[]/recyclingMethod[] filters.
Other published endpoints: detail, waste-types, recycling-methods, search,
health-check. Examples use sparse object schemas, NOT complete runtime contracts.

Owner confirms initial DEV credentials/rotation/private storage; first PROD
read401. Owner confirms separate approved PROD application and privately stores
its credentials separately; one new request returns200. No continuous retry,
threshold change or raw credential access by agent. Both receipts retained.
Test: fixed non-personal `waste-pages?page=1&pageSize=1&lang=fi&search=kaukosäädin`,
10sdeadline/65536bytecap/no redirect, secrets loaded locally by Node and sent
only to the source-confirmed PROD HTTPS endpoint. No paid service or DEV read.

Actual successful response1557bytes has top-level hits(array1), totalCount(number),
queryId(null). Hit fields: id/title(strings), synonyms(array2strings), notes(null),
additionalInfo(string), wasteTypes(array1objects with id/title/description and
informationPageUrl), recyclingMethods(array4objects with id/title/description,
isFree(boolean),infoPageUrl). Only shape/counts saved; not raw guide text/headers.
Evidence is one valid search, not a complete730rule-count or schema guarantee.

Next import must validate observed nullable fields and bounded HTML/untrusted
strings/URLs/pagination/IDs, retain source/date/version/licence/attribution, use
HSY jurisdiction only, keep multiple receptions, preserve unknowns and support
offline snapshot/refresh/rollback tests. Do not infer packaging/material from
search names or claim nationwide acceptance. No dataset imported/consumer wired
by this proof. Local secret files are ignored0600and not part of the app bundle.
