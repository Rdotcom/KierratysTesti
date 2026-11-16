# Kuvatunnistuksen toteutettavuus ja etenemissuunnitelma

Tutkittu 16.11.2026, lähtötilanne `31699de`, työhaara
`codex/illustrated-functional-integration`. Tutkimus ja ehdotus, ei toteutus,
hyväksytty laajuuden muutos tai julkaisuvalmiustodistus.

Jatkopäätös 16.11.: Roope hyväksyi rajatun ehdotuksen ja kokeen (“jooo”).
Alkuperäinen universaali lupaus ei muutu todeksi; seuraava tekninen sopimus on
`object-recognition-pilot-protocol-2026-11-16.md`. Alla olevat hyväksyntää odottavat
maininnat kuvaavat tutkimuksen alkuperäistä päätöshetkeä.

## Päätös

**Alkuperäiselle toteutusvaatimukselle NO-GO.** Kaikkien Suomessa esiintyvien
tuotteiden tarkkaa tunnistusta ja oikeaa lajittelua kaikista kuvista, myös ilman
tekstiä tai viivakoodia, ei voi luvata varmasti. Omistaja kielsi epävarman
toteutuksen aloittamisen; tämän tutkimuksen perusteella ei aloiteta koodausta.

Tämä on myös informaation raja: ulkoisesti samanlaisissa esineissä voi olla eri
materiaali, pinnoite, sisältö, akku tai vaarallinen jäämä. Kuvan ulkopuolista
merkkiä tai pakkauskokoa ei voi päätellä varmasti. Uudet, vanhat, tuonti- ja itse
tehdyt esineet estävät suljetun tuoteluettelon tulkitsemisen koko todellisuudeksi.
Tämä on oma tekninen päätelmä, ei väite jonkin mallin yksittäisestä benchmarkista.
Avoimen joukon tunnistuksen tutkimus käsittelee juuri tuntemattomien erottamista
opituista luokista: [tutkimuskatsaus](https://arxiv.org/abs/2109.00893).

**Ehdotettu vaihtoehto:** rajattu mutta laajennettava lajitteluavustaja, joka
tunnistaa testattuja esineluokkia myös ilman tekstiä, hakee tarvittaessa tarkkaa
tuotetta, pyytää ratkaisevan lisätiedon ja palauttaa tuntemattoman tuloksen, kun
näyttö ei riitä. Mahdollinen arkkitehtuuri ei todista tulevaa tarkkuutta.
Omistajan pitää hyväksyä tämä olennainen rajaus ja erillinen koevaihe ensin.

## 1. Kehitysmalli ja tokenien säästäminen

Kehitystä tekevä GPT ja puhelimen kuvamalli ovat eri asioita.

| Työ | Suositus | Vaihto / pysäytys |
| --- | --- | --- |
| Arkkitehtuuri, aineisto, testisopimus ja turvallisuuspäätökset | GPT-6.1 Sol / High | Medium kun rajaus ja hyväksymisrajat lukittu |
| Rajattu toteutus ja tavallinen vianhaku | Sol / Medium | High vain vaikean juurisyyn tai ristiriidan selvittämiseen |
| Mekaaniset pienet muutokset | Sol / Low; vaihtoehtona saatavilla oleva Luna / Low | Ei itsenäistä mallin laadun tai materiaalitotuuden hyväksymistä |
| Yksi ratkaisematon vaikea suunnittelukysymys | Harkitse Astra / Medium rajattuun katselmointiin | Paluu Soliin päätöksen jälkeen; ei oletusmalliksi |

Tämä on suositus, ei projektilla mitattu mallien kustannusvertailu. Mallia tai
päättelyasetusta ei vaihdettu. Saatavuus ja kulutus riippuvat tilistä/asiakkaasta;
API-hinnasto ei ole Codex-tilauksen kiintiölaskuri. Max/Xhigh/Ultra ja useiden
agenttien rinnakkaistyö eivät ole oletuksia tokenisäästössä.
Lähteet: [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[päättelyohje](https://developers.openai.com/api/docs/guides/deployment-checklist),
[mallin valinta](https://learn.chatgpt.com/docs/model-selection).

Jokaisen myöhemmän työyksikön työjärjestys:

1. Lue tämä päätös, CURRENT_STATE ja yksi NEXT_ACTION; älä koko keskusteluhistoriaa.
2. Kirjaa tavoite, kosketettavat tiedostot, testit ja pysäytysehto etukäteen.
3. Hae `rg`:llä ja lue rajatut otteet. Lokeista yhteenveto ja virheet keskusteluun.
4. Säilytä hash-manifestit/tulokset tiedostoissa. Älä syötä koko kuva-aineistoa
   GPT:lle tai käytä GPT:tä jokaisen testikuvan totuuslabelin keksimiseen.
5. Uusi verkkotutkimus vain muuttuneisiin API-/lisenssi-/laitetietoihin tai aidosti
   ratkaisemattomaan päätökseen; aiempia epäonnistuneita kokeita ei toisteta turhaan.
6. Kapea testi korjauksen aikana; koko `pnpm validate` koherentin työn lopuksi.
7. Ensimmäisessä kokeessa korkeintaan kaksi malliehdokasta. Tallenna epäonnistumiset,
   älä muuta nimittäjiä tai aja testiä uudelleen paremman tuloksen toivossa.
8. Jos sovittu parannusraja ei täyty, päätä datan/rajauksen muutoksesta ennen
   uusia malleja. Tulosten laskennallinen uudelleenluku ei ole uusi kuva-ajo.
9. Luovuta tiiviisti muutos, näyttö, rajoitus ja yksi seuraava tehtävä. Uutta
   keskustelua varten tämä dokumentti toimii tiiviin työmuistin perustana.

Vaihekohtaista todellista tokenilaskutusta ei tässä saatu, joten säästöprosenttia
ei luvata. Ei maksullisia API-kutsuja, pilvikoulutusta tai uusia agentteja.

## 2. Nykytila tarkistettuna

| Osa | Koodi / näyttö |
| --- | --- |
| Viivakoodikamera | `mobile/app/src/app/scan.tsx`: Expo CameraView ja omat viivakoodiasetukset; säilyy itsenäisenä |
| Paikallinen luettelo | `mobile/app/assets/offline-product-catalogue.json`: viisi OFF-tuotetta, kymmenen viitevektoria |
| Tuote-ehdotus | `shared/domain/src/offline-product.ts`: kuvavertailu sekä täydellinen nimi ja määrä; ristiriita hylätään |
| Alusta | `mobile/app/src/features/local-vision/native.ts`: muu kuin iOS palauttaa unavailable; Android-kuvatunnistus puuttuu |
| Mittaus | 17 lähdekuvaa / 5 SKU:ta: top1 11/17, kaksi vahvistettavaa ehdotusta, nolla automaattihyväksyntää ja yksi aikakatkaisu |
| DINOv2 | 14/17 mutta yksi aiempi oikea tulos muuttui vääräksi; kokeellinen, ei puhelimessa |
| Puhelin | iPhone build 11 asennettu/käynnistynyt; ei tämän rakennelman kamera-/lentotila-/Samsung-laatutodistus |

Tarkat rajoitukset: `docs/final/OFFLINE_PRODUCT_INTEGRATION_RESULTS.md` ja
`docs/final/DINOV2_COMPARISON_RESULTS.md`. Ei uusia kuva-ajoja tässä tutkimuksessa.
Vanha 17 kuvan kehitysaineisto ei enää kelpaa riippumattomaksi testiksi.

Vastaus vertailukysymykseen: kuvaesitystä verrataan kymmeneen paikalliseen
viite-esitykseen viidestä OFF-tuotteesta, ei kaikkiin internetin kuviin.
Alkuperäisiä viitekuvia ei tarvitse säilyttää puhelimessa.

## 3. Kolme erillistä tunnistus- ja päätöstehtävää

### A. Viivakoodi ja tarkka tuote

Säilytä nykyinen skanneri ja käsinsyöttö: paikallinen tarkistus/GTIN-normalisointi,
paikallinen luettelo ja erikseen näkyvä verkkohaku. Kelvollinen mutta puuttuva
koodi ei saa johtaa keksittyyn tuotetietoon. Testaa aliasointi, useat koodit ja
duplikaattilukitus. Mallin puuttuminen tai virhe ei saa rikkoa skanneria.
Verkkotietokanta ei toimi offline ilman ladattua tietoa.
[Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/) tukee molempia
alustoja; tämä ei todista nykyisen appin fyysistä Samsung-kameralaatua.

### B. Esineentunnistus ilman tekstiä

Käyttäjä rajaa yhden esineen; laatu- ja moniesinetarkistus ennen yhtä
kuvaluokitusta. Aluksi ei jatkuvaa videopäättelyä eikä raskasta moniesinesegmentointia.
Teksti/koodi on vapaaehtoinen lisänäyttö, ei tämän polun pakollinen ehto.
Nykyistä SKU:n OCR-pakkoa ei vain poisteta: esineluokka on eri tulostyyppi.

Ehdotettu sopimus: `object_candidate`, `product_candidate`,
`confirmed_observation`, `needs_detail`, `unknown`, `unavailable`.
Nämä ovat suunniteltuja eivätkä nyt lisättyjä sopimuksia. Käyttäjän vahvistus
ei ole valmistajan materiaalivarmennus. Mallipiste ei ole oikeellisuusprosentti.

Ensimmäisen kokeen 12 luokkaa: muki/kuppi, lusikka, haarukka/veitsi,
lautanen/kulho, pullo, purkki, juomatölkki, kartonkipakkaus, pussi/kääre,
paristo/akku, pieni sähkölaite ja tekstiili. Lisäksi aidot ulkopuoliset esineet.
Luokkaluettelo ei itsessään osoita mallin osaamista tai materiaalien erottelua.

### C. Lajittelu vasta ratkaisevien havaintojen jälkeen

- Muki: varmista tarvittaessa materiaali ja ehjyys. Muki ei tarkoita keramiikkaa.
- Lusikka: metalli/muovi/puu/tuntematon; kuvaan perustuva muoto ei riitä materiaaliksi.
- Pakkaus: runko, korkki, kansi ja muut irrotettavat osat käsitellään erikseen.
- Akku, sähkölaite, kemikaali, lääke, painepakkaus: turvallisuuskysymys ja oma
  lähteistetty ohje. Epävarmaa esinettä ei automaattisesti sekajätteeseen.
- Vastaus tarvitsee lähteen, alueen, tarkistuspäivän, version, statuksen ja
  perustelun. Puuttuva/ristiriitainen sääntö johtaa neuvontaan, ei AI:n keksimään ohjeeseen.

[Rinki](https://rinkiin.fi/lajittelu-kotona/usein-kysyttya/) erottaa pakkauslasin
astioista ja ohjaa keramiikan/muiden lasien osalta kuntakohtaiseen neuvontaan.
[HSY:n esimerkki](https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/lajittelu/sekajate/)
ei yksin kata Suomea. Valtakunnalliset säännöt vain niiden soveltamisalaan;
muut säännöt alueellisina. Vastaanottopisteen materiaalilista tarkistetaan erikseen.

## 4. Malli- ja alustavalinta: koeteltavat vaihtoehdot

| Ehdokas | Rooli ja ratkaisematon asia |
| --- | --- |
| Nykyinen alkuperäinen MobileCLIP-S0 | Pieni toimiva iOS-baseline; esineluokkien laajennus ja Android-vienti todistettava |
| SigLIP2 Base | Yksi uusi esineluokka-/kuvahaun vertailumalli; virallinen Apache-2.0-mallikortti. Muisti, vienti, nopeus ja kvantisoinnin laatu avoimia |
| DINOv2 | Aiempi SKU-koe säilyy, ei toisteta eikä oteta ensimmäisen kokeen kolmanneksi malliksi |
| Suuri paikallinen VLM / pilvimalli | Ei oletus: muisti/latenssi tai kustannus/kuvasiirto; ei poistaisi puuttuvan tiedon ongelmaa |
| Oma perusmalli alusta | Ei järkevä säästöpolku. Oma luokitin/kalibrointi valmiin kuvaenkooderin päälle vasta datan ja virheanalyysin jälkeen |

[SigLIP2:n virallinen mallikortti](https://huggingface.co/google/siglip2-base-patch16-224)
vahvistaa kuva-/tekstivertailun ja zero-shot-käytön, ei tämän appin tarkkuutta.
[Nykyinen MobileCLIP-lisenssi](https://github.com/apple-aiml-research/ml-mobileclip/blob/main/LICENSE_MODELS)
rajoittaa tutkimuskäyttöön. Projektin sidotun alkuperäisen 2024 ASCL-artefaktin
ehdot ovat eri asia: älä vaihda painoja nimellä ”MobileCLIP” tarkistamatta niitä.
Lisenssin historiallinen lähde on `scripts/qa/local-vision/mobileclip-README.md`.

Säilytä Expo/React Native ja yhteinen TypeScript-päätös-/sääntökerros. Säilytä
iOS:n Core ML/Vision kunnes korvaaja on todistettu. Androidille Kotlin-sovitin;
ensisijainen tutkittava vientipolku on sama kuvaenkooderi
[ONNX Runtime Mobilessa](https://onnxruntime.ai/docs/get-started/with-mobile.html).
[LiteRT](https://developers.google.com/edge/litert) on tarvittaessa vaihtoehto,
ei kolmas rinnakkainen toteutus. Dokumentoitu alustatuki ei takaa valitun mallin
operaattori-, Expo-, kvantisointi- tai Samsung-yhteensopivuutta.

Ennen valintaa testaa samat kuvat, EXIF-suunnat, väriavaruus, normalisointi,
mallihashit, numeeriset toleranssit ja päätösten yhtäpitävyys molemmilla alustoilla.
CPU-varapolku tarvitaan ilman NPU-takuuta. Androidin OCR:lle ML Kit -sovitin;
tarvittava [natiiviviivakoodimalli](https://developers.google.com/ml-kit/vision/barcode-scanning/android)
paketoituna, ei ensimmäisen käynnistyksen verkkolatauksena. Säilytä skanneri,
jos nykyinen toimii; älä vaihda kirjastoa vain vaihtamisen vuoksi.
SDK-telemetria ja verkko-oikeudet tarkistetaan: paikallinen päättely ei yksin
todista nollaverkkoliikennettä. Pilvitunnistus pysyy pois, ei automaattista varapolkua.

## 5. Tietolähteet, lisenssit ja raha

| Lähde | Käyttö | Rajoitus |
| --- | --- | --- |
| Open Food Facts | GTIN, elintarvikemetatieto, pakkauskuvat | Yhteisötieto, ei kaikkien Suomen tuotteiden tai materiaalien varmuutta |
| Omat luvalliset kuvat ja valmistajatieto | Tekstittömät esineet, osat, todelliset kuvausolosuhteet | Materiaalitotuus/oikeudet dokumentoitava, ei AI-arvausta totuuslabeliksi |
| TACO | Roskien kontekstia täydentävä tutkimusaineisto | Ei Suomen SKU-/materiaalitotuus; kuvalisenssit erikseen, toolkitin MIT ei riitä |
| GS1 Data | Mahdollinen toimittajatuotetieto ja kuvat | Sopimus/maksut/oikeudet, ei ilmainen yleinen kuvapankki |
| Rinki, jätelaitokset, tuottajayhteisöt | Lähteistetty sääntö- ja poikkeussisältö | Alue/versio; faktat eivät anna lupaa kopioida koko tekstiä tai kuvia |

[OFF:n lisenssit](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/):
ODbL tietokannalle, DbCL sisällölle ja CC BY-SA kuville. Säilytä lähde-, lisenssi-
ja aikaleimat sekä johdannaisten velvoitteet. Älä yhdistä julkista OFF-luetteloa
ja sopimusrajoitettua dataa ennen oikeuksien selvitystä. Ei verkkokauppojen
satunnaista kaavintaa. [TACO:n alkuperäinen projekti](https://github.com/pedropro/TACO)
on lisäaineistoehdokas, ei ladattu tai hyväksytty aineisto tässä työssä.

GS1:n muuttuva tilanne tarkistettiin uudelleen: [GS1 Data Tuotetiedot](https://gs1.fi/fi/datapalvelut/gs1-data)
on erillisen vuosimaksun palvelu. Tuotekoodimoduulin sisältyminen yritystunnisteen
maksuun ei tarkoita ilmaista yleistä tuoteluetteloa. [Integraatiot muuttuvat](https://gs1.fi/fi/asiakastuki/gs1-datan-integraatiot),
ja [käyttöehdot](https://gs1.fi/fi/gs1-data-kayttoehdot) ovat sopimukselliset.
Tämän sovelluksen tarkka hinta, ML-/offlinekuvajakeluoikeudet ja kattavuus jäivät
varmistamatta. GS1 ei ole rajatun ilmaisen kokeen pakollinen riippuvuus.

Paikallinen päättely voi olla ilman per-kuva-API-maksua ja toimia offline.
Aineiston keruu, työ, mahdollinen koulutuslaskenta, jakelu ja ylläpito eivät
silti ole kuluttomia. Kaikki Suomen tuotteet kattavaa ajantasaista ilmaista
luetteloa ei löytynyt; hakutulos ei ole todistus ettei sellaista voisi syntyä.
Päivitysmalli: allekirjoitettu manifesti, hashit, skeemaversio, mallin ja indeksin
yhteensopivuus, kokorajat, atominen vaihto ja viimeisen ehjän version palautus.
Tuoteluettelon puute ei saa estää esineluokkapolkua.

## 6. Vaiheet, valmistumisehdot ja vastuut

Arviot ovat yhden kokeneen toteuttajan tehollisia työpäiviä, eivät Codex-ajoaikoja,
hintoja tai toimituslupauksia. Kuvien keruu, laitteet ja korjauskierrokset voivat
hallita kalenteriaikaa. Koko Suomen kattavuutta ei sidota näihin arvioihin.

| Vaihe | Valmistumisehto | Arvio / omistaja |
| --- | --- | --- |
| 0. Rajaus | Hyväksy tuntematon/lisäkysymykset ja erillinen rajattu koe; muuten STOP | Roope; ei koodia ennen päätöstä |
| 1. Aineisto/testisopimus | 12 luokkaa, oikeudet/totuuslähteet, train/calibration/test-ryhmäjako, tuntemattomat ja vaaralliset sekoittujat; lukitut kriteerit | 5–10 pv + kuvaus; Codex protokolla, laitteen käyttäjä tarvittavat fyysiset kuvaukset |
| 2. Toteutettavuuskoe | MobileCLIP vs SigLIP2; aidot tekstittömät esineet; iPhone ja Samsung A-/S-sarja; vienti/offline/muisti/nopeus | 5–10 pv; Codex. Vain erikseen hyväksytty koe, ei pääsovelluksen muuttamista |
| 3. Rajattu integrointi | Voittaja testituloksella, sovittimet, lisäkysymykset, sääntökytkentä, erillinen skanneri ja regressiot | 10–20 pv; Codex |
| 4. Laajennus | 30–50 testattua esineluokkaa ja erikseen 500 lähteistettyä SKU:ta, alueiden kattavuusraportti | 10–30+ pv, data ratkaisee; jokainen laajennus versioitava |
| 5. Julkaisukoe | Lukittu riippumaton testijoukko, tuetut laitteet, tietosuoja/lisenssit/päivitys/palautus/kauppajulkaisu | 5–10+ pv; Codex tekninen näyttö, Roope tilit/sopimukset/julkaisupäätös |

Koe ei ole julkaisutodistus. Jos molemmat mallit alittavat rajat, kirjaa syy ja
päätä lisädatasta, hienosäädöstä tai suppeammasta toiminnosta ennen lisäbudjettia.
Älä porttaa hävinnyttä mallia väkisin. Lisäkysymyksen tarve ei katoa tarkemmalla
koodilla, jos ratkaiseva tieto on kuvan ulkopuolella.

### Ensimmäisen kokeen tarkempi sopimusluonnos

- Keruutavoite: 50 eri fyysistä esinettä kustakin 12 luokasta, kolme erilaista
  kuvausta kustakin. 600 esinettä / 1 800 kuvaa ei tarkoita 1 800 riippumatonta
  havaintoa. Luokkakohtainen ryhmäjako 30 esinettä opetukseen/viitteiksi,
  10 kalibrointiin ja 10 suljettuun testiin; sama esine ei ylitä jakoa.
- Lisäksi 200 ulkopuolista esinettä (100 kalibrointiin, 100 suljettuun testiin)
  ja erillinen vähintään 100 esineen riskisekoittujien suljettu joukko. Samat
  fyysiset esineet kuvataan molemmilla alustoilla parivertailua varten, mutta niitä
  ei lasketa kaksinkertaiseksi riippumattomaksi väestöotokseksi.
- Pidä luonnostaan tekstittömät kuvat omana osajoukkona: mukit/ruokailuvälineet
  eivät saa onnistua vain tunnistettavan tuotemerkin tai tiedostonimen ansiosta.
- Näytemanifestiin tunniste, esine-/sessio-/lähderyhmä, lisenssi, SHA256, laite,
  OS, kuvausolosuhde, esineluokka, materiaalitiedon lähde/status, osat ja alue.
  Ei kuvaajan henkilötietoja tai EXIF-paikannusta. Erota luokan totuus
  materiaalin totuudesta; tuntematon materiaali ei saa muuttua testin oletukseksi.
- Kynnys ja luokkatekstit lukitaan kalibroinnista ennen testin avaamista.
  Rekisteröi kummankin mallin hash, esikäsittely, kvantisointi, aikaraja, rivit
  ja epäonnistumisten käsittely ennen yhtäkään suljetun joukon ennustetta.
- Koe jatkoon vain, jos alustavissa testituloksissa saavutetaan vähintään
  99 % hyväksyttyjen esineluokkaehdotusten oikeellisuus ja 70 % kattavuus sekä
  enintään 1 % unknown-väärähyväksyntä, ei turvallisuuskriittistä virheohjetta,
  eikä tunnetun skannerikäytöksen regressiota. Materiaalille ei anneta automaattista
  totuusstatusta. Pieni pilotti ei todista tuotantotarkkuutta: luottamusvälit ja
  luokkakohtainen riittävyys voivat edelleen estää julkaisun.
- Uusi suurempi malli valitaan vain, jos se parantaa parivertailussa tekstittömien
  hyväksyttyjen oikeiden tulosten kattavuutta vähintään 10 prosenttiyksikköä
  ilman väärien/turvallisuusvirheiden lisäystä ja täyttää laiterajat. Muuten
  pienempi baseline säilyy tai molemmat hylätään. Tämä on ehdotettu etukäteisraja,
  ei nykyisistä tuloksista johdettu väite.
- Jos aineistoa ei saada näin luvallisesti ja todellisin labelein, raportoi
  vajaus. Älä täytä puuttuvia rivejä generoiduilla kuvilla tai väitä otosta valmiiksi.

Myöhemmän työn sijoitus: `shared/contracts` havainto-/epävarmuussopimus,
`shared/domain` päätös/kalibrointisäännöt, `shared/recycling-engine` lähteistetty
lajittelu; `mobile/app/modules/local-vision` alustasovittimet ja `mobile/app/src`
kuvaus/palautuminen. Backend vain nykyiseen tuotehakuun ja myöhemmin hyväksyttyyn
aineistopäivitykseen. Ei mobile/backend-ristiintuonteja tai provider-muotoja UI:hin.

## 7. Laatu ja fyysinen todentaminen

Nykyisiä epäonnistuneita SKU-portteja ei alenneta. Esineluokka-/lajitteluprotokolla
on uusi ehdotus, ei keino saada vanha tarkka tuotetunnistus näyttämään valmiilta.

- Mittaa erikseen dekoodaus, luettelokattavuus, exact-SKU, esineluokka, materiaalin
  havainto ja lopullinen lajittelu. Lisäksi ilman apua onnistuminen ja kysymysten määrä.
- Säilytä SKU-tavoitteet: hyväksyttyjen tarkkuus vähintään 99 %, tuntemattomien
  väärä hyväksyntä enintään 1 %, tunnettujen kattavuus vähintään 70 %. Ei saavutettu.
- Ehdota esineluokalle ja lopulliselle ohjeelle erillistä 99 % / 70 % tavoitetta
  määritellyssä käyttöskoopissa. Turvallisuuskriittinen virheohje pysäyttää
  julkaisun. Kaiken hylkäävä malli ei läpäise kattavuusrajaa.
- Raportoi 95 % luottamusvälit. Nolla virhettä 299 riippumattomassa hyväksytyssä
  päätöksessä antaa noin 1 % yksisuuntaisen binomiaalisen virheen ylärajan
  (`1 - 0.05^(1/299)`), ei varmuutta. Käytä oikeaa nimittäjää myös unknown-virheille.
  Saman esineen lisäkuvat eivät automaattisesti ole riippumattomia: esine-/sessio-
  ryhmittely ja ryhmitelty epävarmuusarvio. Pieni luokka ei lainaa koko joukon tarkkuutta.
- Fyysiset esineet, kuvaajat, lähdeperheet ja sessiot erotetaan opetus/testijaossa.
  Crop, augmentaatio tai generoitu kuva ei ole uusi riippumaton kameratesti.
  Testituloksella ei säädetä kynnystä. Epäselvät labelit jäävät raportoituun ryhmään.
- Aito tekstitön muki/lusikka useista materiaaleista; saman näköiset eri SKU:t;
  likaiset/rikkinäiset/märät esineet, heijastus/hämärä, eri puolet, peittyminen,
  monta esinettä, tyhjä kuva ja ulkopuoliset esineet. Tekstin peitto vain stressitestiksi.
- Vanhin tuettu ja uudempi iPhone, keskihintainen Samsung A sekä Samsung S;
  malli/piiri/OS kirjataan ennen testiä. Älä lupaa kaikkia iPhoneja/Samsungeja.
  Alin tukiraja päätetään mittauksista, ei valmistajan nimestä.
- Alustavat käyttörajat: koko polun p95 enintään 3 s lämpimänä / 5 s kylmänä,
  lisämuisti enintään 250 MiB, tunnistusresurssit enintään 150 MiB ennen valinnaista
  aineistoa. Nämä ovat suunnittelutavoitteita, eivät mitattuja tuloksia. Testaa
  alimman tukitason puhelimissa; Macin mittaus ei korvaa niitä.
- Lämpö/energia: 20 peräkkäistä tunnistusta ja 10 min tyhjäkäyntiä; ei taustapäättelyä.
- Offline heti asennuksen jälkeen, ei vain kerran ladatulla mallilla. Puuttuva/
  korruptoitunut malli/indeksi, keskeytys, timeout, peruutus, taustalta paluu,
  muistin loppuminen ja kameraesto; ei automaattista verkkoon lähettämistä.
- FI/EN, VoiceOver/TalkBack, suuri teksti, kontrasti ja palautuminen. Kuvat,
  EXIF ja OCR eivät saa päätyä pysyvään historiaan, analytiikkaan tai lokeihin.
- Viivakoodi-/historia-/lähde-/sääntöregressiot, Android/iOS-releasebuildit,
  mallin ja indeksin atominen päivitys/palautus. `pnpm validate` ei mittaa tunnistustarkkuutta.

Erillisen riippumattoman ihmistarkastajan aiemmin poistettua vaatimusta ei palauteta.
Todelliset kuvat, materiaalitotuuden lähteet ja laitetestit eivät silti synny
mallin omista arvioista. Tämä ei ole uusi juridisen tarkastuksen vaatimus.

## 8. Skillit ja työkalut

Käytetty OpenAI Docs ajantasaiseen mallivalintaan ja Find Skills lisäohjeiden
arviointiin. Hakemisto ja `npx skills find "computer vision"` tarkistettiin.
[Mindrallyn yhteisöskill](https://skills.sh/mindrally/skills/computer-vision-opencv)
oli noin 4 000 asennusta / [lähderepo](https://github.com/mindrally/skills) 306 tähteä,
mutta yleinen OpenCV/PyTorch-ohjeistus ei tuo Suomen testidataa tai materiaalitotuuksia.
Ei asennusta tai suositusta lisätä sitä ongelman ratkaisuksi.

Jo saatavilla olevat aineiston laadun/validoinnin skillit soveltuvat myöhempään
data-auditointiin ja accessibility käyttöliittymään; eivät tarpeen tämän
toteutettavuuspäätöksen tekemiseen. [Hugging Facen virallinen kokoelma](https://github.com/huggingface/skills)
tarkistettiin, mutta koulutusskilliä ei tarvita ennen hienosäädön tarvetta.
Skill ei anna ilmaista GPU:ta tai takaa mallin laatua.

Tarvittavat työkalut ovat ennen kaikkea olemassa olevat testit/hash-manifestit,
Core ML/Vision, Android Studio/ADB, rajattu ONNX-vientikoe, tarvittaessa PyTorch
koulutukseen ja Instruments/Android-profiler laitemittaukseen. Ei uusia
dashboardeja, kirjastoja tai maksullisia palveluita varmuuden korvikkeeksi.

## 9. Tutkimuksen rajat ja seuraava päätös

Linkitetyt lähteet avattiin 16.11.2026. Aiempi 14.–15.11. tutkimus ja kokeet
käytettiin uudelleen. Ei uusia kuva-ajoja, mallikoulutusta, painojen latausta,
puhelintestiä, projektiriippuvuuksien vaihtoa, avainten lukua tai julkaisua.
Skillhakukomento voi käyttää npm:n työkaluvälimuistia; projektiin ei asennettu skilliä.

**Tarvittava omistajan päätös:** hyväksytäänkö rajattu, mitattava lajitteluavustaja
ja erillinen toteutettavuuskoe, vaikka kaikkien esineiden varmaa tunnistusta ei
voi taata? Vasta hyväksynnän jälkeen tehdään vaiheen 1 testisopimus.
