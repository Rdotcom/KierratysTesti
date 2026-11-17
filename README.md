# KeepItGreen

KeepItGreen is a Finnish-first, source-backed packaging sorting app. A user scans or enters an EAN/GTIN; the backend uses Open Facts' public lookup, including bounded routing to its beauty, pet-food and other-products databases, and a versioned rule engine explains available packaging components. Missing and ambiguous data stay explicit—material, shape, and deposit status are never silently guessed. Coverage is incomplete; manual material/code fallbacks remain available.

Previously named KierrätysAppi. The repository name, `@kierratysappi/*` packages, bundle/package identifier, URL scheme and local-storage namespace remain unchanged to preserve development and installed-app continuity. Native launcher names update only after rebuilding and reinstalling; changing the JavaScript UI alone does not relabel an installed binary.

## Kuvasta tunnistaminen

17.11.2026: iOS:n lisäksi sovelluksella on oma Android-natiivisovitin:
SigLIP2-esine-ehdotukset sekä mukana kulkeva ML Kit -teksti-/viivakoodinluku.
Neljä oikeaa JPEG-kehityskuvaa ja materiaalimerkinnän/viivakoodin luku
läpäisevät Android-emulaattorin lentotilakokeen. Tämä ei varmista fyysistä
Samsung-kameraa, kaikkien esineiden tunnistusta tai julkista julkaisuvalmiutta.
Androidin SDK:n teknisten tietojen keruu on erikseen kuvattu tietosuojassa.
Ajantasaiset toimitus- ja testitulokset:
[Android-natiivisovitin](docs/final/ANDROID_NATIVE_DELIVERY.md),
[nykytila](docs/project/CURRENT_STATE.md) ja
[arvioinnin esittelypolku](docs/final/ASSESSMENT_READY.md).

**Paikallinen kuvatunnistus (iOS)** käsittelee kuvan laitteessa Apple Visionilla
ja tarvittaessa mukana olevalla MobileCLIP-kuvamallilla. Se arvioi esineen
muotoa ja lukee mahdollisia materiaalimerkintöjä ilman verkkopyyntöä. Arvio ei
varmista tarkkaa tuotetta, materiaalia tai lajitteluastiaa: materiaalikoodi
tarkistetaan ja vahvistetaan erikseen. Oma natiivimoduuli vaatii yhteensopivan
asennuspaketin; pelkkä JavaScript-päivitys tai Expo Go ei lisää sitä puhelimeen.
Tunnistus on vielä kokeellinen. Hylätyt opetetut lisäluokittelijat ovat vain
QA-työkaluissa, eivät sovelluksessa. Katso
[`LOCAL_CLASSIFIER_UPGRADE.md`](docs/final/LOCAL_CLASSIFIER_UPGRADE.md) ja
[`LOCAL_VISION_TWO_VIEW_RESULTS.md`](docs/final/LOCAL_VISION_TWO_VIEW_RESULTS.md).

Lisäksi on toteutettu **oma pikseleistä toimiva vertailukuvatunnistin** ilman
valmista koneoppimismallia. Se etsii paikallisia kuvapiirteitä ja tarkistaa niiden
geometriset osumat. Tämä erillinen prototyyppi ei vielä ole puhelimen
tunnistustoiminnossa: oikeiden tuotteiden nimet vaativat tarkistetun
vertailukuvakatalogin ja riippumattomat kuvauskokeet. Toteutus ja rajattu koe:
[`OWN_PIXEL_RECOGNITION_RESULTS.md`](docs/final/OWN_PIXEL_RECOGNITION_RESULTS.md).

Oman tunnistimen V2 käsittelee kuvaa neljässä mittakaavassa. Lukitussa,
synteettisessä vertailussa löytyi59/60kuvamuunnelmaa aiemman37/60sijaan,
ilman uusia vääriä osumia tässä kokeessa. Tämä ei ole yleinen tuotetunnistuksen
tarkkuusluku. Tarkistettujen vertailukuvien tuonti on toteutettu erikseen;
tunnistin pysyy vielä kokeellisena, ei puhelimen oletustoimintona.

Sovellukseen on lisätty lyhyet äänipalautteet ja niiden FI/ENpäälle/pois-asetus.
Äänet eivät korvaa virheilmoituksia tai tuotetiedon epävarmuutta. Uusi
natiivikoonti tarvitaan puhelimessa; vanha asennus jatkaa ilman äänimoduulia.
Tulokset ja hyväksymisrajat: [V2 ja äänet](docs/final/VISION_V2_AND_SOUND_FEEDBACK.md).

Kehityskäyttöön on lisäksi toteutettu **Tunnista kuvasta**: kamera → esikatselu →
erillinen lupa lähettää kuva OpenAI:lle → tekoälyn arvio → pakkausosan vahvistus →
lähteistetty lajitteluohje. Epävarmasta kuvasta ei päätellä keräystä. Avain kuuluu
vain palvelimen ignored `.env.local`-tiedostoon; `PHOTO_AI_ENABLED=true` sallii
toiminnon vain kehitysympäristössä. Tuotannossa se pysyy pois käytöstä.
Kuvatoiminto vaatii yhteensopivan natiivin kehitysbuildin; Expo Go ei tue sitä.
Kuvantunnistuksen arviointi ja tunnetut rajoitukset on kirjattu tiedostoon
[`PHOTO_PRODUCT_EVALUATION.md`](docs/final/PHOTO_PRODUCT_EVALUATION.md).
Toteutuksen testievidenssi:
[`PHOTO_RECOGNITION_EVIDENCE.md`](docs/final/PHOTO_RECOGNITION_EVIDENCE.md).

## Kolme selkeää osaa

| Kansio | Vastuu | Oma tarkistus |
| --- | --- | --- |
| [mobile](mobile/README.md) | Puhelinsovellus, kamera/sijainti, näkymät, paikallinen historia ja FI/EN-käännökset | `pnpm validate:mobile` |
| [backend](backend/README.md) | HTTP API, tuotehaku, ulkoisten tietolähteiden adapterit, välimuisti ja tietokantaskeema | `pnpm validate:backend` |
| [shared](shared/README.md) | Yhteiset tietomallit, v1-rajapintasopimus, GTIN-tarkistus ja lähteistetty lajittelulogiikka | `pnpm validate:shared` |

```text
mobile/
  app/                  puhelinsovellus
  localization/         käyttöliittymän käännökset
backend/
  api/                  HTTP-palvelin
  application/          tuotehaun sovelluslogiikka
  data-providers/       Open Facts -adapterit
  database/             migraatiot ja niiden testit
shared/
  contracts/            molempien osapuolten julkinen rajapinta
  domain/               tietomallit ja validointi
  recycling-engine/     lajittelusäännöt ja niiden selitykset
```

Mobile ja backend eivät tuo toistensa koodia: tuotehaku kulkee HTTP-rajapinnan
kautta. Molemmat käyttävät shared-osan julkisia rajapintoja. `pnpm check:boundaries`
estää kielletyt riippuvuudet, yksityisten tiedostopolkujen tuonnit ja kehät.
Jokaisella osalla on omat testit/rakennuskomennot ja oma CI-tulos; koko projektin
`pnpm validate` säilyy pakollisena yhteensopivuustarkistuksena.

Kansioiden erottelu ei ole kolme erillistä kopiota eikä lupaus nollavaikutuksista:
shared-sääntö tai rajapintamuutos voi tarkoituksella vaikuttaa käyttäjiinsä.
Rikkova v1-muutos vaatii uuden version/yhteisen suunnitelman, ei hiljaista
muutosta. Käytännön työnjako ja branch-ohjeet: [TEAM_STRUCTURE.md](docs/project/TEAM_STRUCTURE.md).
Rootin työkalut, lockfile, CI ja dokumentaatio ovat yhteistä integraatioaluetta.

## What works

- Expo SDK 58 app for Finnish and English, camera permission, barcode scanning, manual entry, offline recovery, opt-in app-local history, manual component confirmation, and correction drafts.
- Local Overview with explicitly recorded recycled packaging parts, material percentages, persistent totals and removable recent records. Percentages describe packaging-part counts.
- Fastify API with runtime validation, rate limits, secure headers, explicit CORS allowlist, OpenAPI output, privacy-conscious logging, and a POST lookup boundary.
- Open Facts API v3 adapter with one allowlisted sibling hop, a shared deadline/quota, size limit, source-specific attribution/licence, selected fields and defensive packaging normalization.
- Foreground-only lookup of up to five nearest points against a separately licensed, bundled OSM Finland directory (5,753 points). Distance is calculated on-device; explicit material reports and exclusions are labelled as community data, not verified reception. No GPS upload/background tracking or route claim. Latest native list/map acceptance remains pending.
- Deterministic Finnish packaging rules sourced from Rinki and Palpa, with component-level provenance, confidence, explanations, and exceptions.
- PostgreSQL migration covering 26 entities, forced row security for sensitive records, and immutable published rule versions. This is a tested schema, **not a deployed or runtime-wired database**; current product caching remains bounded process memory.
- Automated unit, contract, integration, migration, API, mobile-state, build, audit, CodeQL, dependency-review, and secret-scanning gates.

## Local development

Requirements: Node 24 LTS and pnpm 11.16.

Expo Go for SDK 58 can exercise barcode/manual/Overview flows with `pnpm dev:mobile --go --clear`; keep the API origin reachable from your phone. It does not contain this project's local-recognition module. The full app needs a matching native build after native-module updates. A developer-signed Release build embeds JavaScript so startup/local features do not depend on Metro; barcode product lookup and the separately consented cloud flow still require their services. A local Release configuration is not an App Store release or recognition-quality acceptance.

```bash
pnpm install --frozen-lockfile
cp backend/api/.env.example backend/api/.env.local
cp mobile/app/.env.example mobile/app/.env
pnpm dev:backend
pnpm dev:mobile
```

For an Android emulator, set `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000`. A physical device needs an HTTPS development endpoint or the workstation's reachable LAN address. Do not put provider secrets in `EXPO_PUBLIC_*` variables.

Run all local quality gates with:

```bash
pnpm validate
pnpm security:audit
```

September 10's Expo compatibility evidence passed `expo install --check` and Expo Doctor 1.20.1 (20/20); it is not a fresh October diagnostic. The workspace enforces a strict 1,440-minute minimum release age for dependency resolution; do not add exclusions merely to consume a fresh release.

Current data inventory, free-access limitations and refresh procedures:
[`DATABASE_READINESS.md`](docs/final/DATABASE_READINESS.md). The full OSM
directory has its own [ODbL notice](mobile/app/assets/data/README.md).

The generated API contract is available at `GET /v1/openapi.json`; product lookup is `POST /v1/recycling/lookup` with `{ "gtin": "…", "language": "fi" }`.

## Release boundary

The release decision is NO-GO. No paid EAS build, store submission, database deployment, analytics/crash vendor, hosted map provider, GS1 data feed or production photo upload is activated. Development photo recognition has separate device-acceptance and recognition-accuracy gates. Public release gates remain in `docs/final/OWNER_ACTIONS.md` and `docs/project/RELEASE_READINESS.md`.

The current school-project UI shows factual data-use/deletion information, not
draft terms or a legal-review banner. Future public/store publication has separate
unapproved privacy/content/operational gates; classroom work does not require
that review. The repository structure change does not approve a production release.
