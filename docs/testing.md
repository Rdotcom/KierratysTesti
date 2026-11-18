# Testaus

```sh
pnpm validate
pnpm security:audit
```

Osakohtaiset tarkistukset: `pnpm validate:mobile`, `pnpm validate:backend` ja
`pnpm validate:shared`. Ne eivät korvaa koko integraation tarkistusta.
CI säilyttää testit, tyypityksen, rajat, koonnit, Expo Doctorin, auditoinnin,
CodeQL:n ja salaisuuksien tarkistuksen.

## Tietoturvakovennus 18.11.2026 — nykyinen paikallinen lähde

- `pnpm validate`: 2 165 testiä (957 Node + 1 208 workspace), tyypit, lint,
  rajat ja koonnit läpäisty. Mobile/backend/shared-osakohtaiset portit läpäisty.
- Frozen install, Expo Doctor 20/20 ja iOS/Android/web-JS-export läpäisty.
  Sama audit-policy: 22 aiempaa low/moderate-löydöstä → 0, ei ohituksia.
- URL-/alkuperä-/Host-/proto-/IP-väärennökset, datarajat, peruutus, lokien
  yksityisyys, paikallistiedon validointi ja poiston jälkeinen kirjoitus testattu.
  HSY:n aidon lähdelinkin regressio korjattu; hyökkääjän samanniminen host estyy.
- Oikea tuotanto-webexport / Chrome / pakotettu CSP: 4 tapausta läpäisty;
  sovellus ja lähteistetty haku toimivat, injektoitu skripti/seurantakuva estyvät,
  piilotiedostot/polkupako estyvät eikä suora reitti avaa kameraa/sijaintia.
  Ei sivuvirheitä tai tavallisen käytön CSP-rikkomuksia; näyttökuva tarkastettu.
- Oikea SigLIP2 / Chrome: 8 tapausta läpäisty. Erillinen FI/EN-vahvistuskoe:
  8 UI-fixturetapausta läpäisty. Overview FI/EN-kirjaukset, korjaukset, poisto,
  pysyvyys ja virhepalautuminen läpäisty. Rinnakkainen Metro-koonti aiheutti
  yhden moduulivälimuistivirheen; puhdas palvelimen uusintakäynnistys ja
  peräkkäinen koe läpäisivät muuttamattomin tarkistuksin.
- Oikea Expon introspection: tuotannon ATS/cleartext estetty, backup=false ja
  OTA pois päältä. Tämä ei ole uusi allekirjoitettu IPA/APK tai fyysinen laitekoe.
- Kolmen ilmoitetun Python-version OSV-kysely: ei osumia; ei koko ketjun auditointi.
  Uutta Windows/GitHub-ajoa, asennusta tai pushia ei tehty. Uhkamalli: security.md.

## Olemassa oleva näyttö

- Macin selainkoe käyttää oikeaa SigLIP2-mallia, JPEG/PNG:tä, erillistä lupaa,
  materiaalivalintaa, lähteistettyä ohjetta, EN-pysyvyyttä ja offline-palautumista.
  Windows x64:n malli/Chrome/Edge on ajettu GitHubin Windows-koneella.
- iPhonen natiiviversio 23 on asennettu ja käynnistys tarkistettu. Omistaja on
  kokeillut Go:n lusikka-/materiaaliohjeen ja kielivalinnan. Android-emulaattorissa
  on tehty natiivi- ja Go-kokeita. Tämä ei ole fyysinen Samsung-hyväksyntä.

## Esine-ehdotuksen vahvistus 18.11.2026

- Yksi ehdotus ja Kyllä/Ei; Ei paljastaa seuraavat kolme ilman hylättyä ehdotusta.
  Epäselvässä tapauksessa vaihtoehdot heti, aina myös Ei mikään näistä.
  Tuntematon/usean esineen kuva ei pakota esinettä tai lajitteluohjetta.
- Sama esityspolitiikka iOS-/Android-havainnoille ja palvelimelle. Vertailupisteet
  ja 0.12/0.04 näyttökriteerit eivät ole kalibroitu varmuus tai lajittelulupa.
  Kuvat, mallipainot, lajittelusäännöt ja kierrätyskirjaukset eivät muutu.
- Rajapinta säilyttää v1:n; laajennettu vastaus vaatii versionoidun Accept-arvon.
  Suostumus, rajat, peruutus, nopeusraja ja vanhojen asiakkaiden vastaus testataan.
  Uutta natiivikoontia, fyysistä laitekoetta tai GitHub-julkaisua ei ole tehty.
- Chrome/oikea SigLIP2: kaikki 8 olemassa olevaa tapausta läpäisevät, nyt myös
  yksi lusikkaehdotus ennen vahvistusta. JPEG/PNG ja erillinen lähetyslupa säilyvät.
- Erillinen UI-fixturekoe: 8 FI/EN-skenaariota läpäisevät Kyllä/Ei-, kolme muuta-,
  Ei mikään-, materiaalivalinta-, takaisin- ja uuden kuvan nollaustapaukset.
  Näppäimistökohdistus, tumma/320px ja reduced motion tarkistettu; ei sivuvirheitä.
  Fixturet eivät ole mallin tarkkuusnäyttöä. Näyttökuvat tarkastettu.
- Overview-koe läpäisee FI/EN-kirjaukset ja korjauksen ilman tuplalaskentaa,
  pysyvyyden, virheistä palautumisen, tietosuojapoiston ja eri näyttötilat.
  Paikallinen testipalvelin suljettu; omistajan muita palvelimia ei muutettu.
- Lopullinen validate läpäisee 2 111 testiä (951 Node + 1 160 workspace), tyypit,
  lintin, rajat ja koonnit. Mobile/backend/shared-osakohtaiset tarkistukset ja
  iOS/Android/web-JS-export läpäisty; JS-export ei ole natiivikoonti/laitekoe.
  Pohjaan on otettu mainin Rdotcom/PR #47:n HSY-parsinta muuttamattomana (`07fc735`);
  provider-testit ja koko integraatio läpäisevät myös tällä pohjalla.

## OpenAI-polun poisto 17.11.2026

- Vanha /photo-linkki ohjaa /local-photo-näkymään kaikilla alustoilla.
  OpenAI-provider, asetukset, kopiot ja maksettavia pyyntöjä tekevät QA-komennot
  on poistettu; vanhat HTTP-reitit vastaavat 404 eikä vanha avain/kytkin aktivoi niitä.
- Kameran koko-/lupatestit sekä JPEG:n EXIF/GPS-poisto- ja kokorajat säilyvät.
  Maksuttoman palvelimen suostumus-, katkaisu-, kuorma- ja sopimustestit säilyvät.
- Paikallinen validate läpäisee 2 093 testiä (951 Node + 1 142 workspace), koonnit,
  tyypityksen, lintin ja rajat. Poistetun palvelun omat testit korvataan
  poistumis-/404-regressioilla; yhteiset kamera-/kuvaturvatestit siirretään.
- Expo Doctor 20/20, frozen install ja iOS/Android/web-JS-paketoinnit läpäisty.
  Muuttamaton auditointi läpäisee edelleen; 22 low/moderate-löydöstä näkyy.
- Oikea SigLIP2/Chrome: 8 tapausta, mukaan lukien vanha linkki, JPEG/PNG,
  lupa, lusikka/metalli, FI/EN-tietosuoja, EN-pysyvyys, offline ja nolla
  OpenAI-/vanhan photo-API:n pyyntöä. Tämä ei ole uusi natiivilaitteen asennus.
- Julkaistu lähde `f0b3349`: 21 vietyä JS-pakettia tarkistettu ilman vanhan
  OpenAI-päätepisteen, mallin tai erillisen toiminnon tekstejä.
- Erillinen Overview-selainkoe läpäisee FI/EN-, vaalea/tumma-, kapea-/suuri teksti-,
  kirjaus-, kuittauskatko-, uusinta-, prosentti-, poisto- ja tietosuojatapaukset.
  Nykyinen maksuton kuvapolku kirjaa vain valitun materiaalin, ei mallin arviota;
  saman kuvan materiaalikorjaus ei tuplaa kirjausta. Testifixturet eivät ole
  oikeaa tuotetietoa eikä tässä kokeessa käytetä maksullista tunnistusta.
- Lähde `7022f66`: [CI 44187544355](https://github.com/roopeaal/KierratysAppi/actions/runs/44187544355),
  [Security 44187544303](https://github.com/roopeaal/KierratysAppi/actions/runs/44187544303) ja
  [Windows 44187891912](https://github.com/roopeaal/KierratysAppi/actions/runs/44187891912)
  läpäisty. Windowsin Chrome/Edge suorittavat kaikki kahdeksan oikean mallin tapausta.
  Kylmän reitin URL-assertion 5 s oletus yhtenäistettiin muiden odotusten 20 s rajaan;
  tarkistuksia ei poistettu. Macin uusinta-ajossa PGliten alustus ylitti rinnakkaisen
  5 s testirajan; erillinen tietokanta-ajo ja kaikki 1 142 workspace-testiä
  paketti kerrallaan läpäisevät muuttamattomin aikarajoin. CI:n koko validate läpäisee.

## Siivouksen rajaus

Alkuperäiset 533 docs-/scripts-/juuritiedostoa on arkistoitu KeepItGreeniin ennen
poistoja: `21e27aa`, archives/kierratysappi-2026-11-17.
Arkiston SHA-256:
`6718b94a7c6914fcd46e7be57c71f9a092bb0102b85dd5ff32b4cb1685a1ffdc`.
Jokaisen arkistoidun tiedoston Git-blob-tiiviste tarkistettiin alkuperäiseen.
38 QA-syötetiedostoa on siirretty muuttamattomina scripts/qa/protocols-kansioon.
Sovelluskoodia, malleja, aineistoja, riippuvuuksia tai testejä ei poisteta.
Siivouksen jälkeen `pnpm validate`: 2 125 testiä (958 Node + 1 167 workspace)
ja kaikki koonnit läpäisty. Neljä uutta testiä tarkistaa rakenteen, linkit,
QA-syötteiden tavut ja laaduntarkistusten säilymisen. Oikean mallin selainkoe
läpäisee kaikki kuusi tapausta ilman sivuvirheitä. Siivoushetken raaka auditointi
raportoi tunnetun high-löydöksen; sitä ei ohitettu (korvaus kuvataan alla).

## Nonrecursive-glob-korjaus 17.11.2026

- Picomatch/Micromatch poistettu lukituksesta. Kahdeksan työkalun oikeat
  moduuliresoluutiot ja SHA-256-lukitut sovituspaikat tarkistetaan automaattisesti.
- 5 544 jäädytettyä vastausvertailua ja 52 672 erillistä projektipolkuvertailua:
  ei eroja oletus-, dot-, kirjainkoko-, basename- ja Windows-tapauksissa.
- 159 hyökkäystapausta, positiiviset kontrollit sekä pituus-/määrä-/syvyys-/
  sulkulaajennusrajat testataan 10 s / 128 Mt V8 old-heap -aliprosessissa.
- Oikeat Expo/Jest/Metro/tinyglobby/fdir/Vite-kokeet kattavat hakukuviot,
  poissulut, piilotiedostot, erikoismerkit, import.meta.glob, custom assetit
  ja Viten fs.deny-suojan. Ei pelkkiä mockeja tai regexp-muotoisia korvikkeita.
- Paikallinen frozen install, koko validate ja koonnit, Expo Doctor 20/20,
  iOS/Android/web-JS-export sekä oikean mallin Chromen kuusi polkua läpäisty.
  JS-export ei ole natiivi iOS-/Android-koonti tai fyysinen Samsung-hyväksyntä.
- Muuttamaton security:audit läpäisee: 0 high/critical; 22 low/moderate
  raportoidaan edelleen. Ei poikkeusta, version vääristelyä tai scannerin vaihtoa.
- Lähde `774ad41` testihaarassa: [CI 44177999529](https://github.com/roopeaal/KierratysAppi/actions/runs/44177999529)
  läpäisee kaikki kolme osaa, 2 125 testiä, koonnit, Doctorin ja muuttamattoman auditoinnin.
  [Security 44177999523](https://github.com/roopeaal/KierratysAppi/actions/runs/44177999523)
  läpäisee CodeQL:n ja salaisuustarkistuksen.
- [Windows 44178058438](https://github.com/roopeaal/KierratysAppi/actions/runs/44178058438):
  oikeat glob-sovitukset, frozen install, mallin JPEG-pariteetti, kaikki kolme
  JS-exportia sekä todelliset Chrome- ja Edge-mallipolut läpäisty.
  PR-kohtainen dependency-review ei kuulu push-ajoon; PR:ää ei ole avattu.
- Omistaja hyväksyi main-julkaisun 17.11.2026: testattu `ec1e137` siirrettiin
  KierratysAppi/mainiin fast-forward-pushilla. Auditointipolitiikka, appikoodi,
  mallit ja aineistot säilyvät. Puhelinasennusta tai KeepItGreen-repoa ei muutettu.

Kuvantunnistuksen yleinen luotettavuus, kaikki materiaalit/alueet, oikean
Samsungin kamera ja pitkäaikainen muistinkulutus eivät ole näillä testeillä
varmennettuja. MEM-01-muistidiagnostiikka on avoin. Nämä rajat eivät poistu
dokumentaation siirtämisen mukana.
