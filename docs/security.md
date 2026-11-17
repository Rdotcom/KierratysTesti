# Tietoturva ja rajaukset

## Glob-riippuvuuden korvaus

GHSA-fc5q-39xc-vjpf / CVE-2026-112366 on edelleen picomatchin **high**-löydös:
https://github.com/advisories/GHSA-fc5q-39xc-vjpf.
Tässä korjauksessa picomatch ja Micromatch poistetaan kokonaan sovelluksen
riippuvuusgraafista. Niiden koodia ei nimetä uudelleen eikä versioita vääristetä.
Kahdeksan työkalun oikeat kutsut sovitetaan alkuperäisellä rakennustyökalusovittimella
Minimatch 11.0.9:n ei-rekursiiviseen moottoriin.

Muuttamaton `pnpm security:audit` läpäisee high/critical-rajan. Muut 22
low/moderate-löydöstä näkyvät edelleen; niitä ei piiloteta poikkeuksilla.
Yhtäkään auditoinnin poikkeusta, tasomuutosta tai ohitusta ei lisätä.
[Toteutus, lisenssit ja rajatut API-muutokset](../patches/README.md).
Moottorin muutos: https://github.com/isaacs/minimatch/blob/main/changelog.md.

Sovitin rajoittaa syötteiden, kuvioiden, sulkulaajennusten ja polkujen kuormaa.
Rajatut hyökkäystestit ja puhdas high-audit eivät todista kaikkien mahdollisten
kuvioiden turvallisuutta. Uudet työkalupäivitykset vaativat uuden sovitusarvion.

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
