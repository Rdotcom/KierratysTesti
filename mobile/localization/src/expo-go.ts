export const expoGoFi = {
  expoGoHomeDetail: "Lue viivakoodi tai hae esine nimellä",
  expoGoRecognitionTitle: "Offline-tunnistus tarvitsee erillisen asennuksen",
  expoGoRecognitionBody:
    "Expo Go ei sisällä sovelluksen omaa offline-kuvatunnistinta. Erillinen KeepItGreen-asennus tunnistaa laitteessa. Expo Gossa voi käyttää omaa verkkotunnistuspalvelinta, jos sen osoite on määritetty. Kuvaa ei lähetetä automaattisesti.",
  expoGoAvailable:
    "Voit silti lukea viivakoodin, hakea esineen tai materiaalin ja katsoa lajitteluohjeen.",
  expoGoManualTitle: "Hae esine tai materiaali",
  expoGoManualDetail: "Lajitteluohjeet ilman kuvatunnistusta",
  expoGoWhyRecognition: "Miksi kuvatunnistus ei ole tässä käytössä?",
};
export const expoGoEn: { readonly [K in keyof typeof expoGoFi]: string } = {
  expoGoHomeDetail: "Scan a barcode or search for an item by name",
  expoGoRecognitionTitle: "Offline recognition needs a separate installation",
  expoGoRecognitionBody:
    "Expo Go does not include this app's offline image recognizer. The separate KeepItGreen installation recognizes on device. Expo Go can use your own recognition server when its address is configured. No image is sent automatically.",
  expoGoAvailable:
    "You can still scan a barcode, search for an item or material and read sorting guidance.",
  expoGoManualTitle: "Search for an item or material",
  expoGoManualDetail: "Sorting guidance without image recognition",
  expoGoWhyRecognition: "Why is image recognition unavailable here?",
};
