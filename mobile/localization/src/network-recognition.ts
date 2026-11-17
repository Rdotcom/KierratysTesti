export const networkRecognitionFi = {
  recognitionDetails: "Tietoa tunnistuksesta",
  recognitionAction: "Tunnista kuva",
  recognitionSendTitle: "Lähetetäänkö kuva tunnistettavaksi?",
  recognitionMarkingManual:
    "Materiaalikoodin voi syöttää käsin. Merkinnän kuvatunnistus on käytössä vain erikseen asennetussa sovelluksessa.",
  webImageStart: "Ota tai valitse kuva",
  webImagePreparing: "Kuvaa valmistellaan…",
  webImageHint: "Tarkistat kuvan ennen lähettämistä.",
  webChooseImage: "Valitse kuva",
  webChooseAnother: "Valitse toinen kuva",
  webImageInvalid:
    "Kuvaa ei voitu avata. Valitse JPEG-, PNG- tai WebP-kuva (enintään 12 Mt ja 16 megapikseliä). HEIC-, SVG- ja liikkuvat kuvat eivät käy.",
  webCameraSecure:
    "Selainkamera tarvitsee localhost-osoitteen tai HTTPS-yhteyden. Voit myös valita kuvan tiedostosta.",
  webCameraDenied:
    "Kameraa ei saatu käyttöön. Tarkista selaimen kameralupa ja että kamera on kytketty, tai valitse kuva tiedostosta.",
  networkLegalTitle: "Valinnainen verkkotunnistus selaimessa ja Expo Gossa",
  networkHttpNotice: "Lähiverkon HTTP-yhteys ei ole salattu. Käytä vain luotettua verkkoa.",
  networkCaptureGuidance:
    "Kuvaa yksi esine kokonaan hyvässä valossa. Vältä heijastuksia ja pidä kamera paikallaan.",
  networkCameraLabel: "Kuvatunnistuksen kamera",
  networkTitle: "Tunnista kuva",
  networkIntro:
    "Tarkista esine-ehdotus ja valitse materiaali itse. Tunnistus käyttää omaa palvelintasi ja vaatii verkkoyhteyden.",
  networkRecipient: "Kuvan vastaanottaja",
  networkConsent:
    "Kuva lähetetään tunnistuspalvelimelle. Se käsitellään muistissa, eikä sitä tallenneta tiedostoon tai välitetä muihin palveluihin.",
  networkSend: "Lähetä kuva ja tunnista",
  networkSending: "Tunnistetaan kuvaa…",
  networkUnavailable:
    "Tunnistuspalvelimeen ei saada yhteyttä. Tarkista verkkoyhteys ja että palvelin on käynnissä. Voit myös käyttää viivakoodia.",
  networkSetup:
    "Verkkotunnistinta ei ole määritetty tähän kehitysistuntoon. Käytä erillistä KeepItGreen-asennusta tai käynnistä oma SigLIP2-palvelin ja määritä sen osoite.",
  networkError: "Kuvaa ei voitu tunnistaa. Ota uusi kuva tai valitse materiaali lajitteluoppaasta.",
  networkRateLimited:
    "Tunnistin on varattu tai pyyntöjä on liikaa. Odota hetki ja yritä uudelleen.",
  networkRetake: "Uusi kuva",
  networkCandidateSource: "Arvion lähde: SigLIP2 · oma palvelin · ei varmennettu tunnistus",
  networkDetail: "Arvio esineestä. Tarkistat materiaalin itse. Vaatii yhteyden palvelimeen.",
  networkHomeDetail: "Lue viivakoodi tai tunnista tuote kuvasta",
};
export const networkRecognitionEn: Record<keyof typeof networkRecognitionFi, string> = {
  recognitionDetails: "About recognition",
  recognitionAction: "Recognize the image",
  recognitionSendTitle: "Send this photo for recognition?",
  recognitionMarkingManual:
    "You can enter a material code manually. Recognition of photographed markings is available only in the separately installed app.",
  webImageStart: "Take or choose a photo",
  webImagePreparing: "Preparing the image…",
  webImageHint: "Review the photo before sending.",
  webChooseImage: "Choose a photo",
  webChooseAnother: "Choose another photo",
  webImageInvalid:
    "Cannot open this image. Choose JPEG, PNG or WebP (up to 12 MB and 16 megapixels). HEIC, SVG and animated images are not supported.",
  webCameraSecure:
    "Browser camera access needs localhost or HTTPS. You can also choose an image file.",
  webCameraDenied:
    "Cannot access the camera. Check the browser camera permission and that a camera is connected, or choose an image file.",
  networkLegalTitle: "Optional online recognition in the browser and Expo Go",
  networkHttpNotice: "The local HTTP connection is not encrypted. Use only a trusted network.",
  networkCaptureGuidance:
    "Photograph one whole item in good light. Avoid reflections and hold the camera steady.",
  networkCameraLabel: "Image recognition camera",
  networkTitle: "Recognize an image",
  networkIntro:
    "Review the suggested item and choose its material yourself. Recognition uses your own server and needs a network connection.",
  networkRecipient: "Photo recipient",
  networkConsent:
    "Your photo is sent to the recognition server. It is processed in memory, not saved to a file or forwarded to other services.",
  networkSend: "Send photo and identify",
  networkSending: "Recognizing the image…",
  networkUnavailable:
    "Cannot reach the recognition server. Check your network connection and that the server is running. You can also use a barcode.",
  networkSetup:
    "No recognition server is configured for this development session. Use the separately installed KeepItGreen app, or start your own SigLIP2 server and configure its address.",
  networkError:
    "Could not recognize this photo. Take another photo or choose a material in the sorting guide.",
  networkRateLimited:
    "The recognizer is busy or there are too many requests. Wait a moment and try again.",
  networkRetake: "New picture",
  networkCandidateSource: "Estimate source: SigLIP2 · own server · unverified recognition",
  networkDetail:
    "An estimate of the object type. You review the material yourself. Requires a server connection.",
  networkHomeDetail: "Scan a barcode or identify an item from a photo",
};
