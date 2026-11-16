# Arviointiesittely — 17.11.2026

KeepItGreen on toimiva kouluprojekti, ei vielä yleiseen jakeluun hyväksytty tuote.
Tekninen nimi ja Git-repo ovat edelleen KierrätysAppi. Uudet tiedot eivät ole
uusi kuvantunnistusmalli eikä sovellus tunnista kaikkia tuotteita varmasti.

## Lyhyt esittely

“Sovellus auttaa löytämään esineelle tai pakkaukselle lajitteluohjeen.
Viivakoodilla etsitään tuotetietoa, kameralla saadaan esine-ehdotuksia ja
tekstihaku avaa ohjeita. Epäselvä materiaali valitaan itse. Ohjeen lähde ja alue
näkyvät vastauksessa. Kameraehdotukset ja mukana olevat aineistot toimivat
puhelimessa ilman maksullista tekoälypalvelua.”

## Kolmen minuutin esittelypolku

1. Avaa KeepItGreen. Etusivun **Skannaa tuote** avaa Tunnista-välilehden:
   viivakoodi, koodin käsinsyöttö ja paikallinen kuvatunnistus.
2. Hae etusivulta **kaukosäädin** → sähkölaitekeräys. Hae **lusikka** ja
   valitse **Metalli** → lyhyt aterimen metallinkeräysohje.
3. Hae **Paistinpannu, kasari**, valitse alueeksi Vantaa/HSY → HSY:n ohje ja
   vastaanottovaihtoehdot. Englanniksi sama haku on **Frying pan, saucepan**.
   Kunta voidaan myös valita sijainnilla; rajatapauksessa se vahvistetaan itse.
4. Tunnista → Syötä viivakoodi käsin. Mukana olevia oikeita esimerkkikoodeja:
   **6408430030309** (Valio Oivariini), **6408430039432** (Oltermanni),
   **6410500090014** (Finn Crisp). Nämä ovat lähteen tuotetietoja, eivät
   keksittyjä esittelytuloksia. Jos pakkausosat puuttuvat, valitse materiaalikoodi
   tai tunnista osa käsin; tuotenimestä ei arvata lajitteluastiaa.
5. Kuvaa tavallinen lusikka paikallisella tunnistuksella. Ehdotuksesta Lusikka →
   Metalli → lähteistetty ohje. Kamera ei tiedä metalliseosta eikä varmista
   kaikkia esineitä. Huono kuva voi jäädä tunnistamatta.
6. Lähimmät pisteet näyttää sijaintiarvion mukaan useita pisteitä, osoitteen tai
   karttalinkin ja aineiston ilmoittamat materiaalit. Puuttuvaa tietoa ei keksitä.
7. Yhteenvetoon voi kirjata oman kierrätysmerkinnän. Haku ei kasvata laskuria.
8. Asetukset → English. Navigoi ja sulje/avaa sovellus: kieli säilyy, kunnes
   vaihdat sen itse. Äänet voi sammuttaa asetuksista.

## Mitä ilman internetiä oikeasti toimii?

- Paikallinen kuvantunnistus, materiaalivalinnat ja yleiset mukana olevat ohjeet.
- **658** HSY-ohjetta FI/EN, vain HSY-kunnille. Muilla alueilla vanhat lähteistetyt
  paikallisohjeet tai turvallinen “ei varmennettua ohjetta”. Ei koko Suomen opas.
- **199** lähteestä tarkistettua mukana olevaa viivakoodi-identiteettiä sekä
  alkuperäinen pieni vertailuluettelo. Tämä ei ole koko kaupan tuotetietokanta.
- Lisäksi onnistuneet verkkohakutulokset enintään **100 kielikohtaista tulosta /
  30 päivää**, vain tässä laitteessa. Tuotteen materiaalit voivat silti puuttua.
- Pistehakemisto ja puhelimessa tehty etäisyyslaskenta; GPS-luvan/paikannuksen
  pitää onnistua. Ulkoinen kartta ja uudet viivakoodit tarvitsevat internetin.

Mac, johto, Metro tai maksullinen API eivät ole mukana olevien toimintojen
avaamisen edellytys. Uusien ruokatuotteiden verkkohaku voi käyttää suoraa
Open Food Facts -varareittiä, jos kehityspalvelin ei vastaa. Se voi epäonnistua
lähdepalvelun, yhteyden tai tuotetietojen puuttumisen takia.

## Rehelliset rajat ja seuraava vaihe

- Kuvantunnistus käyttää valmiita MobileCLIP/SigLIP2-malleja ja omaa käsittely-,
  vertailu-, epävarmuus- ja ohjeistuslogiikkaa. Ei itse tyhjästä opetettu yleis-AI.
- Yleistä tunnistustarkkuutta, kaikkia suomalaisia tuotteita tai kaikkien kuntien
  ohjeita ei ole varmennettu. Samsung/Androidin natiivivertailu on kesken.
- Aiempi muistijälkilöydös MEM-01 ja julkisen julkaisun laatugatet ovat edelleen
  avoimia. Kouluesittelyn toimivuus ei sulje niitä.
- Nykyinen iPhone-kehitysallekirjoitus päättyy **23.11.2026 klo12.53 Suomen aikaa**.
  Huomisen arviointia varten sitä ei tarvitse uusia. Älä poista sovellusta.
- Ei uutta GitHub-pushausta. Lähdekoodi ja testievidenssi ovat paikallisessa
  integraatiohaarassa; julkiseen jakeluun on erillinen NO-GO-arvio.

## UI-viimeistelyn perustelut

| Ennen | Jälkeen | Miksi |
| --- | --- | --- |
|5tuotetta, Macin katkos näytti verkon puutteelta |199lähdeidentiteettiä, paikallinen määräaikainen välimuisti ja suora julkinen varahaku | Hyödyllinen itsenäinen esittely; ei lupaa kaikkien tuotteiden offline-tietokannasta |
|Kameranäkymän käsinsyöttö käytti eri pientä luetteloa |Sama laajennettu viivakoodihaku kaikista käsinsyötöistä |Ei kahta ristiriitaista hakua; kuvatunnistuksen rajattu vertailuvalikoima säilyy erillisenä |
|4materiaalia/23esinehakua |Lisäksi658kaksikielistä HSY-ohjetta ja aluerajaus | Enemmän oikeaa sisältöä ilman keksittyjä lajitteluohjeita |
|Vanha kieliasetus saattoi ohittaa uuden |Jonotettu tallennus ja vanhentuneen latauksen suoja | English pysyy valittuna myös uudelleenavauksessa |
|Voimakkaampi ja tiheämpi äänipalaute |Volyymi0.28,600msjäähy; vain skannauksen/tuloksen/tallennuksen tai virheen palaute | Ei navigointi- tai materiaalivalintapiippauksia; hiljainen tila ja ruudunlukija huomioidaan |
|Pidempi siirtymä, tulos saattoi jäädä alas |180mskoriste-/siirtymäliike, hakutulos heti; vähennetty liike ohittaa koristeen | emil-design-eng: liike tukee toimintoa eikä viivytä vastausta; ei jatkuvaa animaatiota |

Tarkka ohjelmisto-, selain- ja asennusevidenssi: `TEST_EVIDENCE.md`.
