# 1. Mobile — puhelinsovellus

Tämä osa vastaa siitä, mitä käyttäjä näkee ja tekee. Sovellus on `app/`,
FI/EN-käännökset `localization/`. Kamera, sijainti, saavutettavuus, navigointi,
paikallinen historia/luonnokset ja ulkoisten vastausten turvallinen esitys ovat
tämän osan vastuulla. Sovelluksen nimi/tekniset tunnisteet säilyvät ennallaan.

Root-kansiosta:

```sh
pnpm dev:mobile
pnpm validate:mobile
```

Tarkistus käsittelee mobilea ja sen ilmoitettuja shared-riippuvuuksia. Se ei
rakenna tai testaa backendin toteutusta. Web-vienti ja puretut UI-tilatestit eivät
korvaa iPhonen/Androidin fyysisiä kamera-, sijainti- tai saavutettavuuskokeita.

Mobile saa käyttää oman osansa paketteja ja shared-pakettien julkisia exportteja.
Tuotehaun palvelimeen otetaan yhteys `POST /v1/recycling/lookup` -rajapinnalla;
palvelimen koodia, tietokantaa, tunnuksia tai provider-vastausmuotoja ei tuoda
sovellukseen. HTTP-sopimus on `shared/contracts`, ei `backend/application`.
`EXPO_PUBLIC_*`-muuttujat ovat julkisia: niihin ei laiteta salaisuuksia.

Esimerkiksi painikkeen ulkoasu tai käännös voidaan muuttaa täällä ilman backendin
tiedostojen muokkaamista. Shared-sopimuksen muutos on erillinen koordinoitu työ.
Koko integraatio: `pnpm validate`. Ohje: `../docs/architecture.md`.
