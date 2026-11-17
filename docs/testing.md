# Testaus

```sh
pnpm validate
pnpm security:audit
```

Osakohtaiset tarkistukset: `pnpm validate:mobile`, `pnpm validate:backend` ja
`pnpm validate:shared`. Ne eivät korvaa koko integraation tarkistusta.
CI säilyttää testit, tyypityksen, rajat, koonnit, Expo Doctorin, auditoinnin,
CodeQL:n ja salaisuuksien tarkistuksen.

## Olemassa oleva näyttö

- Siivottu lähde `2c63588`: 2 125 testiä ja koonnit läpäisty.
  [CI 44162245767](https://github.com/roopeaal/KierratysAppi/actions/runs/44162245767)
  läpäisee parts/full/Expo-tarkistukset ja epäonnistuu vain tunnetussa picomatch-
  auditoinnissa. [Security 44162245784](https://github.com/roopeaal/KierratysAppi/actions/runs/44162245784)
  läpäisee CodeQL:n ja salaisuuksien tarkistuksen.
- Aiemmat picomatch-paikkauskokeet koskevat vanhaa toteutusta, eivät uuden
  moottorin hyväksyntää. Nykyiset regressiot testaavat oikeaa uutta toteutusta.
- Macin selainkoe käyttää oikeaa SigLIP2-mallia, JPEG/PNG:tä, erillistä lupaa,
  materiaalivalintaa, lähteistettyä ohjetta, EN-pysyvyyttä ja offline-palautumista.
  Windows x64:n malli/Chrome/Edge on ajettu GitHubin Windows-koneella.
- iPhonen natiiviversio 23 on asennettu ja käynnistys tarkistettu. Omistaja on
  kokeillut Go:n lusikka-/materiaaliohjeen ja kielivalinnan. Android-emulaattorissa
  on tehty natiivi- ja Go-kokeita. Tämä ei ole fyysinen Samsung-hyväksyntä.

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
- Main on edelleen `5fa2557`. Puhelimen asennusta tai KeepItGreen-repoa ei muutettu.

Kuvantunnistuksen yleinen luotettavuus, kaikki materiaalit/alueet, oikean
Samsungin kamera ja pitkäaikainen muistinkulutus eivät ole näillä testeillä
varmennettuja. MEM-01-muistidiagnostiikka on avoin. Nämä rajat eivät poistu
dokumentaation siirtämisen mukana.
