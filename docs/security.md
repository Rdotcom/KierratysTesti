# Tietoturva: uhkamalli ja kovennus

Tutkittu 18.11.2026 lähteestä `63e6949` ja sitä seuraavista paikallisista korjauksista.
Tämä on lähde-/kokoonpanokatselmus ja rajattu hyökkäystestaus, ei riippumaton
pentest, MASVS-sertifiointi tai todiste jo asennetun puhelinversion turvallisuudesta.

## Suojattava tieto ja rajat

- Suojattavaa: käyttäjän valitsema kuva, mahdollinen EXIF, sijainti, paikallinen
  hakuhistoria/luonnokset, palvelinavaimet sekä allekirjoitus- ja julkaisuketju.
- Puhelimen sovellushiekkalaatikko erottaa tämän sovelluksen muiden appien tiedoista.
  Pelkkä API-haavoittuvuus ei anna pääsyä yhteystietoihin tai koko kuvakirjastoon.
  Sovelluksen/SDK:n haitallinen koodi voisi käyttää sovelluksen jo saamia lupia.
- Mahdollisia hyökkääjiä: haitallinen lähdedata/kuva, verkon väliintulija, vieras
  verkkosivu/lähiverkkolaite, vaarantunut riippuvuus/julkaisutili tai laitteen haltija.
- Native: kamera → rajattu JPEG/EXIF-poisto → paikallinen malli → käyttäjän valinnat.
  Go/web: sama kuva → erillinen suostumus → oma tunnistuspalvelin, ei OpenAI.
  Viivakoodi → GTIN-validointi → paikallinen aineisto/välimuisti → HTTPS-tuotehaku.
- Tuote-/OCR-/mallitieto ei ole koodia, oikeus myöntää käyttöoikeuksia tai varmennettu
  lajittelupäätös. Palvelinavaimia ei toimiteta mobiilipakettiin.

## Löydökset ja toteutetut korjaukset

**SEC-01 / high — liian väljät ulkoiset URL:t.**
Näyttö: domainin `z.url()` hyväksyi myös ei-web-skeemoja, ja UI kutsui suoraan
`Linking.openURL`. Haitallinen vastaus olisi voinut käynnistää muun sovelluksen.
Toisto: `web-url.test.ts` ja `external-links.test.ts` käyttävät file/content/intent/
javascript-, tunnus-, IP- ja localhost-syötteitä. Korjaus: HTTPS-lähdeskeema ja yksi
vartioitu, tarkistettuihin lähdehosteihin rajattu OS-avausraja kaikille lähdelinkeille. Sisäiset kaksi havaintoviitettä
säilyvät erillisinä, mutta niitä ei voi avata ulkoisina linkkeinä. Paikallinen: tehty.

**SEC-02 / high — implisiittinen kehitys-HTTP ja iOS:n mallipohjan ATS-poikkeus.**
Näyttö: puuttuva ympäristö tarkoitti kehitystilaa; Expon pohjassa arbitrary loads=true.
Korjaus: puuttuva tuotantoasetus ei avaa loopback-hakua, julkinen HTTP hylätään;
HTTP sallitaan vain erikseen valitussa kehitystilassa yksityiseen IPv4/loopback-osoitteeseen.
Natiiviplugin sulkee tuotannossa ATS-poikkeukset ja Android-cleartextin sekä varmistaa
allowBackup=false. Toisto: config-testit ja Expon oikea introspection iOS/Androidille.
Labran HTTP ei ole salattu eikä sitä hyväksytä julkiseksi tuotannoksi. Paikallinen: tehty;
uuden allekirjoitetun asennuksen käyttöjärjestelmätodennus on vielä erillinen vaihe.

**SEC-03 / high — rajoittamaton tuotehaun vastaus ja vastauksen koon moninkertaistuminen.**
Näyttö: mobiilin `response.json()` ei rajannut vastausta ennen jäsentämistä;
provider saattoi monistaa pienen komponenttilistan suureksi normalisoiduksi vastaukseksi.
Korjaus: streaming-fetch, 1 MB todellinen tavuraja, katkaisu, ei evästeitä/redirectejä,
enintään 32 pakkausosaa ja 20 brändiä. Kuvan URL rajataan OFF:n kuvanjakeluhosteihin.
Toisto: bounded-json/transport-security sekä OFF:n 5 000 komponentin testi.
Providerin hylätyt vastaukset suljetaan. Paikallinen: tehty.

**SEC-04 / medium — raakavirheteksti ja hyökkääjän tunniste lokissa.**
Näyttö: 500- ja käynnistysvirheeseen liitettiin alkuperäinen Error.
Korjaus: vain rajattu tilakoodi/kiinteä tapahtuma ja palvelimen oma request-ID;
ei syötettä, otsakkeita, kuvaa, GTIN:ää, URL-kyselyä tai stack/messagea.
Toisto: API:n `security.test.ts` tarkistaa oikean lokivirran synteettisillä merkkijonoilla.
Paikallinen: tehty. Tuotannon lokien oikeudet ja säilytys kuuluvat myös operaattorille.

**SEC-05 / medium — CORS ei ollut pyyntöjen esto / paikallisen palvelun DNS-rebinding.**
Korjaus: väärä/null-Origin hylätään ennen providereita; paikallinen kuvapalvelu
hyväksyy vain loopbackin/yksityisen IP:n Hostin. Forwarded-otsakkeisiin ei luoteta.
Rajat: 20 s yhteys/pyyntö, 15 s handler, 5 s keepalive, 100 pyyntöä/socket, 128 yhteyttä;
olemassa olevat kuva-/haku-/IP-kiintiöt ja yhden mallityön portti säilyvät.
Toisto: API-hyökkäystestit todentavat Origin/Host/IP-väärennökset ja proto-syötteet.
Tämä ei ole tunnistautuminen: saman luotetun LANin natiivi asiakas voi käyttää palvelua.
Julkinen kuvapalvelu pysyy tuotantotilassa estettynä. Paikallinen: tehty.

**SEC-06 / medium — paikallisen tiedon validointi ja poiston jälkeinen myöhäinen kirjoitus.**
Korjaus: historia/luonnokset validoidaan, raakakoko rajataan ennen JSON-jäsennystä,
kirjoitukset/opt-out/poisto sarjallistetaan. Poisto mitätöi aiemman työn, peruuttaa
aktiivisen haun ja estää vanhan vastauksen välimuisti-/historiakirjauksen ja varahaun.
Toisto: storage-security, lookup-cache ja transport/local-first-cancellation-testit.
AsyncStorage ei ole sovellustason salattu holvi: siihen ei saa tallentaa tunnuksia.
Historia on opt-in, offline-välimuisti enintään 100 tuotetta / 30 vrk; käyttäjä voi poistaa tiedot.
Paikallinen: tehty. Tämä ei lupaa suojaa rootatulta/avatulta tai forenssisesti tutkitulta laitteelta.

**SEC-07 / medium — selainjulkaisun puolustava suojaus puuttui.**
Korjaus: web-koonti tuottaa `_headers`-tiedoston. CSP sallii vain omat skriptit ja
luotetun bootstrapin tiivisteet, ei unsafe-inline/eval-skriptejä. Zod käynnistyy
jitless-tilassa ennen Routeria. Inline-tyylit sallitaan React Native Webin vuoksi;
verkko rajataan omiin määriteltyihin osoitteisiin ja julkiseen OFF-hakuun.
Lisäksi frame-ancestors/X-Frame-Options, nosniff, no-referrer, COOP/CORP,
camera/geolocation=self ja microphone=none. Paikallinen staattinen palvelin estää
polkupaon, symlinkit, piilotiedostot ja sourcemapit. Toisto: `security-browser.mjs`
käyttää oikeaa tuotantoexportia ja todentaa skriptin/seurantakuvan eston selaimessa.
Paikallinen: tehty. Oikean hostingin on toimitettava otsakkeet; pelkkä tiedosto ei riitä.

**SEC-08 / low–moderate — 22 tunnettua JavaScript-riippuvuuslöydöstä.**
Korjatut oikeat versiot: fast-uri 3.1.9/4.2.3, ip-address 10.7.4,
node-forge 1.4.3, esbuild 0.28.1 ja fingerprintin minimatch 11.0.9.
Sama muuttamaton auditointi raportoi nyt 0 löydöstä; ei suppressioita tai tasomuutoksia.
Sama auditointi lisätään viikoittaiseen Security-ajoon; uutta GitHub-ajoa ei ole vielä tehty.
Aiempi picomatch-high ei ole madallettu: toteutus poistettiin jo aiemmassa työssä.
Toisto: frozen install, `pnpm security:audit`, työkalusovittimien testit ja Expo Doctor.
Kolmelle ilmoitetulle Python-versiolle tehty OSV-kysely ei löytänyt osumia; se ei
kata koko transitiivista Python-/natiivibinääriketjua. Paikallinen: JS-korjaukset tehty.

## Säilyneet suojaukset ja rajaukset

Ei WebView-pohjaista lähdesisällön suorittamista, vapaata shell-komentoa tai
kuvasta tulkittavien ohjeiden suorituskanavaa. JPEG:n tyyppi-/koko-/pikselirajat,
metatietojen poisto, mallitiivisteet, määräajat ja peruutus säilyvät. Kamera ja
sijainti tarvitsevat käyttäjän toiminnon; suora sivulinkki ei käynnistä niitä.
Mikrofonia tai taustasijaintia ei tarvita. Käyttämätön OTA-päivitys on pois päältä.
Älä rakenna omaa salausta: mahdolliset tulevat tunnukset kuuluvat Keychain/Keystoreen.
Yleistä kuvantunnistustarkkuutta tai natiividekooderien haavoittumattomuutta ei luvata.

## Julkaisun portit ja omistajat

- **Roope / release:** uusi allekirjoitettu ei-debug-julkaisu; tarkista lopullisen
  IPA/APK:n luvat, TLS/varmenteet, debug-oikeudet ja varmuuskopiointi oikeilla laitteilla.
  Nykyistä puhelinasennusta ei ole muutettu. Expo Gon omaa natiivipakettia emme hallitse.
- **Roope / operaattori:** valitse hosting/domain ja varmista TLS, oikeat otsakkeet,
  palvelinavainten erillinen säilytys, lokien lyhyt säilytys, päivitys- ja palautusmenettely.
  `pnpm serve:web:secure` on vain loopback-tarkistus, ei julkinen HTTPS-palvelu.
  Julkinen tunnistuspalvelu vaatii erillisen käyttöoikeus-/kapasiteettiratkaisun.
- Windowsin/natiivibinäärien ja koko Python-ketjun uusi todennus ei ole tämän
  lähdekatselmuksen perusteella hyväksytty. Tuotanto-GO:ta ei anneta ilman näitä portteja.

## Ensisijaiset lähteet (luettu 18.11.2026)

[OWASP MASVS](https://mas.owasp.org/MASVS/), [Android-hiekkalaatikko](https://source.android.com/docs/security/app-sandbox),
[Android-verkkosuojaus](https://developer.android.com/privacy-and-security/security-config),
[Apple ATS](https://developer.apple.com/documentation/security/preventing-insecure-network-connections),
[React Native / storage](https://reactnative.dev/docs/security), [turvalliset URI:t](https://developer.android.com/privacy-and-security/risks/unsafe-uri-loading),
[OWASP lokit](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), [OWASP CSP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html),
[Expo entry](https://docs.expo.dev/router/installation/), [Expo julkiset ympäristöarvot](https://docs.expo.dev/guides/environment-variables/),
[OSV-kysely](https://google.github.io/osv.dev/post-v1-querybatch/).
