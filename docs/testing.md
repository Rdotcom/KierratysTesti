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

- Lähde `2148d4e`: 2 121 testiä ja koonnit läpäisty, Expo Doctor 20/20.
  CI 44149097249/44150085287 läpäisee parts/full/Expo-tarkistukset ja epäonnistuu
  vain tunnetussa picomatch-auditoinnissa. Security 44149097071/44150085543 onnistuu.
- Picomatch: 585 rajattua haitallista vertailua, 5 932 kirjaston omaa testiä sekä
  1 124 928 lyhyen syötteen vertailua läpäisty. Testit eivät ohita high-löydöstä.
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
läpäisee kaikki kuusi tapausta ilman sivuvirheitä. Raaka auditointi raportoi
edelleen tunnetun high-löydöksen; sitä ei ole ohitettu.

Kuvantunnistuksen yleinen luotettavuus, kaikki materiaalit/alueet, oikean
Samsungin kamera ja pitkäaikainen muistinkulutus eivät ole näillä testeillä
varmennettuja. MEM-01-muistidiagnostiikka on avoin. Nämä rajat eivät poistu
dokumentaation siirtämisen mukana.
