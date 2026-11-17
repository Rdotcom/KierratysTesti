# KeepItGreen — KierrätysAppi

Sovellus auttaa löytämään esineelle tai pakkaukselle lajitteluohjeen. Tuotetta
voi hakea viivakoodilla, esineen nimellä tai kamerakuvasta. Käyttäjä vahvistaa
epäselvän materiaalin; ohjeen lähde ja alue näytetään vastauksessa.

## Toiminnot

- Viivakoodin skannaus ja käsinsyöttö sekä esine- ja materiaalihaku.
- Kuvantunnistuksen esine-ehdotukset ja materiaalin valinta.
- Lähimmät kierrätyspisteet, ilmoitetut materiaalit ja karttalinkit.
- Paikallinen hakuhistoria ja omat kierrätysmerkinnät.
- Suomen- ja englanninkielinen käyttöliittymä, pysyvä kielivalinta.

Asennettu natiivisovellus käsittelee kuvan puhelimessa. Expo Go ja selain
käyttävät tietokoneella käynnissä olevaa maksutonta tunnistuspalvelinta, jolle
kuva lähetetään erillisellä hyväksynnällä. Tunnistus antaa ehdotuksia, ei
varmaa tuotteen tai materiaalin tunnistusta.

## Projektin kolme osaa

| Kansio | Sisältö |
| --- | --- |
| [mobile/](mobile/README.md) | Sovellus, natiivimoduulit ja FI/EN-käännökset |
| [backend/](backend/README.md) | HTTP API, tuotehaku, tietolähteet ja tietokantaskeema |
| [shared/](shared/README.md) | Yhteiset tietomallit, rajapintasopimukset ja lajittelusäännöt |

`scripts/` sisältää kehitys- ja testityökalut, `patches/` riippuvuuskorjaukset
ja `.github/` automaattiset tarkistukset. Ne eivät ole erillisiä sovelluksia.

## Käynnistys

Tarvitaan Node.js 24 ja pnpm 11.16.0. Kuvatunnistuspalvelin tarvitsee lisäksi
Python 3.12:n ja kerran ladattavan mallin.

```sh
pnpm install --frozen-lockfile
pnpm dev:expo-go
```

[Expo Gon, selaimen ja palvelinten asetukset](docs/setup.md).

## Testit

```sh
pnpm validate
pnpm security:audit
```

[Arkkitehtuuri](docs/architecture.md) ·
[Aineistot ja lisenssit](docs/data-and-licenses.md) ·
[Testaus](docs/testing.md) ·
[Tietoturva ja tunnetut rajoitukset](docs/security.md)

Sovelluksen tekniset paketti- ja laitetunnisteet käyttävät edelleen nimeä
KierrätysAppi. Niitä ei vaihdeta pelkän näyttönimen mukana.
