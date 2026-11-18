# Käynnistys

Tarvitaan Node.js 24, pnpm 11.16.0 ja kuvatunnistuspalvelimeen Python 3.12.
Suorita komennot projektin juuresta. Älä hävitä omia paikallisia muutoksia
päivityksen yhteydessä.

```sh
pnpm install --frozen-lockfile
```

## Selain: Windows

Valmistele Python ja maksuton SigLIP2-malli kerran PowerShellissä:

```powershell
py -3.12 -m venv work\siglip-server-venv
.\work\siglip-server-venv\Scripts\python.exe -m pip install -r backend/data-providers/python/requirements.txt
pnpm vision:prepare work/network-model
pnpm dev:web:recognition
```

Avaa http://localhost:8097. Käynnistin avaa sekä selaimen kehityspalvelimen että
tunnistuspalvelimen. Pidä pääte käynnissä; Ctrl-C pysäyttää ne.
Mallin valmistelu tarkistaa tiedostojen tiivisteet eikä korvaa olemassa olevaa
kansiota. Älä poista tarkistuksia, jos vanha asennus ei vastaa mallia.
Mallin lataus tarvitsee internetin; itse tunnistus tapahtuu omalla koneella.

## Selain: Mac

```sh
python3.12 -m venv work/siglip-server-venv
work/siglip-server-venv/bin/python -m pip install -r backend/data-providers/python/requirements.txt
pnpm vision:prepare work/network-model
pnpm dev:web:recognition
```

Selaimen kamera tarvitsee localhost- tai HTTPS-osoitteen sekä käyttöluvan.
Kuvan valitseminen tiedostosta toimii ilman kameraa. Windowsin selain ei ole
Expo Go; Expo Go voidaan avata erikseen Android-emulaattorissa.

## Expo Go

Perustoiminnot:

```sh
pnpm dev:expo-go
```

Käytä projektin SDK 58:n kanssa yhteensopivaa Expo Gota. iPhonen Expo Go ja
Expo CLI tarvitsevat saman Expo-tilin; kirjaudu itse, älä jaa tunnuksia.
Go ei sisällä sovelluksen omaa natiivista kuvatunnistusmoduulia.

Go-kuvatunnistus käyttää samaa edellä valmisteltua Python-mallia. Käynnistä
palvelin erillisessä päätteessä määrittämällä Pythonin ja mallin polut.
PowerShellissä:

```powershell
$env:SIGLIP_PYTHON = (Resolve-Path work/siglip-server-venv/Scripts/python.exe).Path
$env:SIGLIP_ASSETS = (Resolve-Path work/network-model).Path
pnpm dev:siglip
```

Macissa vastaavat asetukset:

```sh
export SIGLIP_PYTHON="$PWD/work/siglip-server-venv/bin/python"
export SIGLIP_ASSETS="$PWD/work/network-model"
pnpm dev:siglip
```

Salaamaton HTTP edellyttää myös Expon päätteessä nimenomaista
`EXPO_PUBLIC_APP_ENV=development`-asetusta (PowerShell: `$env:EXPO_PUBLIC_APP_ENV = 'development'`).
Tuotannossa käytetään HTTPS:ää; natiivin labra-HTTP vaatii erillisen kehityskoonnin.

Android-emulaattorissa aseta Expon käynnistyspäätteeseen
`EXPO_PUBLIC_SIGLIP_BASE_URL=http://10.0.2.2:3004` ennen `pnpm dev:expo-go`.
PowerShellin muoto on `$env:EXPO_PUBLIC_SIGLIP_BASE_URL = 'http://10.0.2.2:3004'`.
iOS-simulaattori käyttää osoitetta `http://127.0.0.1:3004`.

Fyysinen puhelin tarvitsee yhteyden tietokoneeseen samassa luotetussa verkossa.
Aseta palvelimen `HOST=0.0.0.0` ja Expon
`EXPO_PUBLIC_SIGLIP_BASE_URL=http://TIETOKONEEN-OMA-LAN-OSOITE:3004`.
Korvaa osoite omalla yksityisellä osoitteellasi. HTTP ei ole salattu;
sovellus näyttää vastaanottajan ja pyytää erillisen lähetysluvan.
Älä julkaise kehityspalvelinta internetiin tai avaa reitittimen portteja.

## Natiivisovellus ja tuotehaku

Oma iOS-/Android-koonti käyttää
[local-vision-natiivimoduulia](../mobile/app/modules/local-vision/README.md).
Natiiviriippuvuuksien muutokset vaativat uuden koonnin; pelkkä Expo-päivitys ei
lisää niitä Expo Goon. Natiivin kuvantunnistus ei tarvitse tunnistuspalvelinta.
Laiteallekirjoitus ja asentaminen edellyttävät omaa Xcode-/Android-ympäristöä.

Valinnainen tavallinen tuotehaku-API käynnistyy `pnpm dev:backend`.
Tämä komento voi lukea palvelimen paikallisen `.env.local`-tiedoston; säilytä
avaimet vain palvelimella. Älä aseta salaisuuksia `EXPO_PUBLIC_*`-muuttujiin.
Erillinen OpenAI-tunnistus on poistettu. Oma SigLIP2-palvelin ei käytä avainta tai maksullista
tunnistuspalvelua. Verkkotuotehaku ja ulkoinen kartta voivat tarvita internetin.

## Selainjulkaisun suojaus

`pnpm build` tuottaa web-exportin ja CSP-/turvaotsakkeet (`mobile/app/dist/_headers`).
Määritä julkiset API-osoitteet suoraan koontiprosessin ympäristöön; web-koonti ei
lue `.env`-tiedostoja, jotta JavaScriptin ja otsakkeiden osoitteet eivät eroa.
Älä lisää CSP:hen `unsafe-eval`- tai skriptien `unsafe-inline`-poikkeuksia.
`pnpm serve:web:secure` näyttää exportin vain localhost:8099:ssä turvaotsakkein.
Oikean HTTPS-hostingin on toimitettava samat otsakkeet; tiedoston olemassaolo
ei yksin riitä. Kehityksen Metro/Expo-palvelinta ei julkaista internetiin.
