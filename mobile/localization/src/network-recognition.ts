export const networkRecognitionFi = {
  webImageStart: "Valitse kuva esineestä",
  webImagePreparing: "Kuvaa valmistellaan…",
  webImageHint:
    "Valitse kuva tiedostosta tai ota kuva kameralla. Kuvaa ei lähetetä vielä tässä vaiheessa.",
  webChooseImage: "Valitse kuva tiedostosta",
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
    "Kuvaa yksi esine kerrallaan kokonaan hyvässä valossa. Tunnistin ehdottaa esineen tyyppiä; valitset materiaalin itse.",
  networkCameraLabel: "Esine-ehdotuksen kamera",
  networkTitle: "Tunnista tuote kuvasta",
  networkIntro:
    "Kuva käsitellään omalla SigLIP2-palvelimella. Tulos on esine-ehdotus, ei varmistettu tuote tai materiaali.",
  networkRecipient: "Kuvan vastaanottava palvelin",
  networkConsent:
    "Lähetä vain kuva esineestä: ei ihmisiä tai yksityisiä tekstejä. Kuva käsitellään palvelimen muistissa, sitä ei tallenneta tiedostoon eikä lähetetä tekoäly-yhtiölle. Tunnistuspalvelimen pitää olla käynnissä ja saavutettavissa.",
  networkSend: "Hyväksyn lähetyksen · tunnista kuva",
  networkSending: "Tunnistetaan palvelimella…",
  networkUnavailable:
    "Tunnistuspalvelimeen ei saada yhteyttä. Tarkista, että palvelin on käynnissä ja sen osoite on oikein, tai käytä viivakoodia.",
  networkSetup:
    "Verkkotunnistinta ei ole määritetty tähän kehitysistuntoon. Käytä erillistä KeepItGreen-asennusta tai käynnistä oma SigLIP2-palvelin ja määritä sen osoite.",
  networkError: "Kuvasta ei saatu esine-ehdotuksia. Kokeile uudelleen tai valitse esine itse.",
  networkRateLimited:
    "Tunnistin on varattu tai pyyntöjä on liikaa. Odota hetki ja yritä uudelleen.",
  networkRetake: "Ota uusi kuva",
  networkCandidateSource: "Oma palvelin: SigLIP2 · ei varmennettu tunnistus",
  networkDetail: "Esine-ehdotus omalta palvelimelta · vaatii verkkoyhteyden",
  networkHomeDetail: "Lue viivakoodi tai tunnista kuvasta verkossa",
};
export const networkRecognitionEn: Record<keyof typeof networkRecognitionFi, string> = {
  webImageStart: "Choose a photo of an item",
  webImagePreparing: "Preparing the image…",
  webImageHint: "Choose an image file or take a photo. Nothing is sent at this stage.",
  webChooseImage: "Choose an image file",
  webChooseAnother: "Choose another image",
  webImageInvalid:
    "Cannot open this image. Choose JPEG, PNG or WebP (up to 12 MB and 16 megapixels). HEIC, SVG and animated images are not supported.",
  webCameraSecure:
    "Browser camera access needs localhost or HTTPS. You can also choose an image file.",
  webCameraDenied:
    "Cannot access the camera. Check the browser camera permission and that a camera is connected, or choose an image file.",
  networkLegalTitle: "Optional online recognition in the browser and Expo Go",
  networkHttpNotice: "The local HTTP connection is not encrypted. Use only a trusted network.",
  networkCaptureGuidance:
    "Photograph one whole item in good light. The recognizer suggests an object type; you choose the material yourself.",
  networkCameraLabel: "Object suggestion camera",
  networkTitle: "Identify an item from a photo",
  networkIntro:
    "Your own SigLIP2 server processes the image. The result is an object suggestion, not a verified product or material.",
  networkRecipient: "Server receiving the image",
  networkConsent:
    "Send only a photo of an item: no people or private text. The image is processed in server memory, not saved to a file or sent to an AI company. The recognition server must be running and reachable.",
  networkSend: "I agree to send · identify image",
  networkSending: "Recognizing on the server…",
  networkUnavailable:
    "Cannot reach the recognition server. Check that the server is running and its address is correct, or use a barcode.",
  networkSetup:
    "No recognition server is configured for this development session. Use the separately installed KeepItGreen app, or start your own SigLIP2 server and configure its address.",
  networkError: "No object suggestions were available. Try again or choose the item yourself.",
  networkRateLimited:
    "The recognizer is busy or there are too many requests. Wait a moment and try again.",
  networkRetake: "Take another photo",
  networkCandidateSource: "Own server: SigLIP2 · unverified recognition",
  networkDetail: "Object suggestions from your own server · network required",
  networkHomeDetail: "Scan a barcode or recognize an image online",
};
