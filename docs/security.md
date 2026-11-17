# Tietoturva ja rajaukset

## Picomatch

GHSA-fc5q-39xc-vjpf / CVE-2026-112366 on **high**-löydös. Julkaistua virallista
korjattua versiota ei tarkistuksessa 17.11.2026 löytynyt. Projektissa on
testatut pnpm-paikkaukset kaikille kolmelle käytössä olevalle versiolle.
Ne estävät toistetut ongelmatapaukset; ne eivät ole virallinen julkaisu tai
yleinen kaikkien säännöllisten lausekkeiden turvallisuustodistus.

`pnpm security:audit` näyttää löydöksen edelleen eikä tarkistusta ohiteta.
[Paikkausten alkuperä, MIT-lisenssi ja rajaukset](../patches/README.md).
Virallinen lähde: https://github.com/advisories/GHSA-fc5q-39xc-vjpf.
Riippuvuusylläpitäjän seuraava työ on ottaa käyttöön tuettu virallinen korjaus
sen ilmestyessä ja suorittaa samat tarkistukset uudelleen.

## Yksityisyys ja palvelimet

- Käyttö ei vaadi käyttäjätiliä. Historia ja kierrätysmerkinnät ovat paikallisia.
- Natiivikuva käsitellään laitteessa. Go/browser lähettää kuvan omalle palvelimelle
  vasta erillisestä hyväksynnästä. Palvelin käsittelee kuvan muistissa, ei kirjoita
  kuvatiedostoa tai välitä sitä maksulliseen tunnistuspalveluun.
- Paikallinen HTTP-kehitysyhteys ei ole salattu. Käytä vain luotettua verkkoa.
  Julkinen palvelu vaatisi erillisen HTTPS-, tunnistus- ja käyttöympäristöratkaisun.
- Palvelinavaimet eivät kuulu puhelimeen, Git-repoon, kuviin tai lokiin.
  API validoi syötteet ja rajoittaa kuorman. Älä avaa admin-/kehitysreittejä julkisiksi.
- Tietokantaskeema ei yksin tarkoita valmista tuotantopalvelua.

Kuvantunnistus ei varmista kaikkia esineitä tai materiaaleja. Fyysinen Samsung,
laaja tunnistustarkkuus sekä muistipaine-/energia-/pitkäkestoiset laitekokeet ovat
osittain tekemättä. Julkista tuotanto-/kauppajulkaisua ei ole hyväksytty.
