# Arkkitehtuuri

| Osa | Vastuu |
| --- | --- |
| mobile/app | Expo/React Native -käyttöliittymä, kamera, sijainti ja paikallinen tila |
| mobile/localization | Suomen- ja englanninkieliset tekstit |
| backend/api | Fastify HTTP API ja erillinen kuvatunnistuspalvelin |
| backend/application | Tuotehaun yhdistäminen ja välimuisti |
| backend/data-providers | Ulkoisten tuotetietojen normalisointi ja Python-kuvamalli |
| backend/database | PostgreSQL-skeema, migraatiot ja testit |
| shared/contracts | Versioidut rajapintasopimukset ja runtime-validointi |
| shared/domain | GTIN-tarkistus ja yhteiset tietomallit |
| shared/recycling-engine | Lajittelusäännöt, alueet ja lähdetiedot |

Mobile ja backend käyttävät shared-pakettien julkisia exportteja. Ne eivät tuo
toistensa toteutuksia. Tätä valvovat `pnpm check:boundaries` ja CI.

Viivakoodihaku käyttää mukana olevaa aineistoa, paikallista välimuistia ja
tarvittaessa Open Facts -verkkohakua. Puuttuva pakkaustieto ei ole sama asia
kuin puuttuva tuote. Materiaalia ei päätellä tuotteen nimestä.

Natiivin kuvatunnistusmoduulin lähde on
[mobile/app/modules/local-vision](../mobile/app/modules/local-vision/README.md).
Go/browser käyttää erillistä SigLIP2-palvelinta ja samaa esine-/materiaalivalinnan
käyttöliittymää. Ehdotus ei ole varmennettu tuotetunnistus.

Lajitteluohje ja kierrätyspistehakemisto ovat eri aineistoja. Pisteen yhteisön
ilmoittamat vastaanottomateriaalit eivät itsessään ole tarkistettu lajittelusääntö.

Tietokantaskeema on toteutettu ja testattu, mutta nykyinen API-välimuisti on
rajattu prosessimuisti. Tämä ei ole väite käyttöön otetusta tuotantotietokannasta.
