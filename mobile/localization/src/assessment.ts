export const assessmentFi = {
  offlineCachePrivacy:
    "Onnistuneita tuotehakuja säilytetään vain tällä laitteella enintään 30 päivää, korkeintaan 100 kielikohtaista tulosta. Niitä voi käyttää ilman verkkoyhteyttä. Välimuisti ei sisällä kuvia tai sijaintia eikä ole käytön seurantaa. Tietojen poisto tyhjentää myös välimuistin; kielivalinta säilyy.",
  guideTranslationIncomplete:
    "Lähteen käännöksestä puuttuu osa tarkennuksista. Tarkista tarvittaessa HSY:n alkuperäinen ohje.",
  languageSaveError:
    "Kielivalintaa ei saatu tallennettua. Valittu kieli toimii tässä istunnossa. Kokeile valintaa uudelleen.",
  guideSourceTitle: "HSY:n jäteopas",
  guideSourceRegion: "HSY:n alueen ohje · toimii ilman verkkoyhteyttä",
  guideSourceChoices: "Valitse hakua vastaava esine",
  guideSourceReceivers: "Minne vien?",
  guideSourceWasteTypes: "Jätelaji",
  guideSourceCondition:
    "Tarkista esineen kunto ja pakkauksen mahdolliset vaaramerkinnät. Keräyspisteen omat ohjeet ovat ensisijaisia.",
  guideSourceChooseRegion:
    "Tälle esineelle on HSY:n ohje. Valitse kunta, jotta näet soveltuuko se alueellesi.",
  guideSourceAssumption:
    "Ohje valitsemasi esineen ja kunnan perusteella — ei kuvatunnistuksen varmistama.",
  guideSourceAttribution: "HSY · CC BY 4.0 · lähdetieto muotoiltu tekstiksi",
  sourceRecord: "Lähdetunniste",
  offlineLibraryInfo:
    "Tuoteluettelo ja HSY:n jäteopas ovat laitteessa. Muut viivakoodit haetaan verkosta. Tuotenimi ei yksin varmista pakkausmateriaalia.",
  offlineLookupHelp:
    "Tätä viivakoodia ei ole laitteen tuoteluettelossa. Yhdistä internetiin ja yritä uudelleen tai valitse pakkauksen materiaali lajitteluoppaasta.",
};
export const assessmentEn: Record<keyof typeof assessmentFi, string> = {
  offlineCachePrivacy:
    "Successful product lookups are kept only on this device for up to 30 days, at most 100 language-specific results, for offline use. The cache contains no photos or location and is not usage tracking. Deleting local data also clears the cache; your language choice is kept.",
  guideTranslationIncomplete:
    "Some details are missing from the source translation. Check HSY's original guide if needed.",
  languageSaveError:
    "Your language could not be saved. It is active for this session. Try selecting it again.",
  guideSourceTitle: "HSY waste guide",
  guideSourceRegion: "Guidance for the HSY area · works offline",
  guideSourceChoices: "Choose the matching item",
  guideSourceReceivers: "Where can I take it?",
  guideSourceWasteTypes: "Waste type",
  guideSourceCondition:
    "Check the item's condition and any hazard markings. The collection point's own instructions take priority.",
  guideSourceChooseRegion:
    "HSY has guidance for this item. Choose your municipality to check whether it applies to your area.",
  guideSourceAssumption:
    "Guidance based on your selected item and municipality — not verified image recognition.",
  guideSourceAttribution: "HSY · CC BY 4.0 · source information converted to plain text",
  sourceRecord: "Source record",
  offlineLibraryInfo:
    "The product catalogue and HSY waste guide are on your device. Other barcodes are looked up online. A product name alone does not verify packaging material.",
  offlineLookupHelp:
    "This barcode is not in the on-device catalogue. Connect to the internet and try again, or choose the packaging material in the sorting guide.",
};
