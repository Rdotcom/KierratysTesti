# Offline lookup, object search and regional policy

Primary sources accessed 2026-11-16. This is implementation research, not a
claim that all products/materials/municipalities have reviewed sorting rules.

## Free data and actual boundaries

- [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/):
  public food-code reads, identifying User-Agent, rate limits, field selection;
  database ODbL and contents DbCL. Existing bundle contains only five identities,
  not the whole Finnish product market. No name-to-packaging inference is valid.
- [HSY open Jäteopas](https://www.hsy.fi/ymparistotieto/avoindata/avoin-data---sivut/jateopas-paakaupunkiseutu/):
  REST/JSON, CC BY4.0, monthly updates, thousands of search terms. Registration
  required; approximately730instructions reported by HSY in its
  [November2025 announcement](https://www.sttinfo.fi/tiedote/71633633/hsy-avasi-jateoppaan-datan-tavoitteena-lajittelun-lisaaminen?lang=fi&publisherId=4346).
  It is a capital-region guide, NOT an authoritative rule set for all Finland.
- [HSY's access instructions](https://avoidatastr.blob.core.windows.net/avoindata/AvoinData/2_Jatteet_ja_kierratys/Jateopas/HSY%20J%C3%A4teopas%20-%20ohje%20apin%20k%C3%A4ytt%C3%B6oikeuden%20hakuun.pdf):
  owner registers at [Anypoint portal](https://eu1.anypoint.mulesoft.com/exchange/portals/hsy-1),
  opens HSY Jäteopas API, requests PROD access, creates application KeepItGreen,
  selects the free SLA and requests access. My applications contains client ID
  and secret. Stop if payment is requested. Never put credentials in mobile,
  chat, source control or public evidence. No authenticated call/data export was
  performed here. Do not invent the authenticated response schema or use DEV
  responses as production records. Future server adapter must validate actual
  output and generate an attributed bounded offline snapshot before shipment.

## Regional differences actually represented

| Topic | HSY | LSJH | Kiertokaari |
| --- | --- | --- | --- |
| Broken ceramic tableware | Small quantities household mixed; larger Sortti noncombustible | Household mixed OR station tableware-ceramics collection | Small household mixed; glass/ceramics max5kg per emptying |
| Glass household object | Not glass packaging; regional mixed/station guidance | Mixed; larger batches station residual waste | Mixed, same5kg limit |
| Small ordinary plastic object | Mixed, not packaging collection | Mixed, not packaging collection | Mixed, not packaging collection |
| Larger metal reception example | HSY Sortti station | LSJH sorting station, e.g. Topinoja Turku | Rusko waste centre Oivapiste Oulu |

Sources: [HSY ceramic](https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/jatteet/keramiikka/),
[HSY glass](https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/jatteet/lasiesine/),
[HSY plastic](https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/jatteet/muoviesine/),
[HSY metal](https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/jatteet/metalli/),
[LSJH ceramic item](https://lsjh.fi/jate/astia-keraaminen/),
[LSJH tableware collection](https://lsjh.fi/jatelaji/astiakeramiikka/),
[LSJH glass](https://lsjh.fi/jate/lasiesine-lasiastia/),
[LSJH plastic](https://lsjh.fi/jate/muoviesine/),
[LSJH metal](https://lsjh.fi/jatelaji/metalli/),
[Kiertokaari mixed](https://kiertokaari.fi/jatelaji/sekajate-kiinteistolta/),
[Kiertokaari cutlery/reception](https://kiertokaari.fi/jate/aterimet-metalliset/).
These are concise original summaries, not copied guide text. Named stations are
examples of accepting receptions, NOT a calculated nearest station/opening claim.
Small metal cutlery has its own direct
[Rinki instruction](https://rinkiin.fi/lajittelu-kotona/lajitteluohjeet/metallin-lajitteluohjeet/),
without the irrelevant oversized-spoon exception. Electronics/remote controls use
[SER instructions](https://serkierratys.fi/ser-kierratys/ohjeita-sahkolaitteiden-palauttajalle/):
remove batteries only when easy; device itself is WEEE, not plastic packaging.

## Region membership and geometry

Operator membership: [HSY2026 municipalities](https://julkaisu.hsy.fi/jatehuollon-hinnasto-2026_1/M3gzbwpIq.html),
[LSJH18municipalities](https://lsjh.fi/tutustu-meihin/),
[Kiertokaari9municipalities](https://kiertokaari.fi/kiertokaari-oy/).
Five HSY +18LSJH +9Kiertokaari =32supported municipalities. Textiles remain
HSY-only. Other known municipalities are explicitly unsupported for local rules.

[Statistics Finland open geodata](https://stat.fi/fi/palvelut/tilastodatapalvelut/avoin-data-ja-rajapinnat/paikkatietoaineistojen-rajapintakaytto)
provides CC BY4.0 municipal boundaries. `kunta1000k_2026` WFS CRS84 snapshot:
308municipalities,103836vertices. Raw2774656bytes SHA256
`06f01c77e411137447d9ddb13b3b50aebc3e1c21db7163c2ce8f988e68ae27ab`.
Tracked2081602bytes SHA256
`8c81936ca7421ad34697531384a9f5f443f5dc507b7727ed3f83f4f558dcce76`:
five-decimal coordinate quantization only, no vertices/rings removed; attribution,
licence, source hash, checked date and transform embedded. Data scripts bound
download size/time/count, validate coordinates/rings and refuse overwrites.

Containment is offline, including holes/multipolygons; never infer a municipality
from nearest recycling bin/centroid. Cartographic1:1000000boundaries are coarse:
1500muncertainty margin PLUS reported GPS accuracy refuses automatic selection.
Even coastal Helsinki/Oulu centres can require manual confirmation. Retain that
restriction, not a falsely precise region. One-shot location only on request or
the existing nearby flow; raw coordinates are never persisted/sent/logged here.
Transient town choice clears on background; new town invalidates old answers.

The editorial23item index maps aliases to existing source-backed policy, not
all possible objects. Unknown searches never invent an answer. An owner account
can enable the larger HSY import; other operators still need their own checked
rules. No paid dataset, inference or new package was used.
