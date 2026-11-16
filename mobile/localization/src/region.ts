export const regionFi = {
  regionConfirm: "Vahvista kunta",
  regionNotSelected: "Ohjealue: valitse kunta tai käytä sijaintia",
  regionLocate: "Valitse alue sijainnilla",
  regionManual: "Valitse kunta käsin",
  regionMunicipality: "Kunnan nimi",
  regionNoMatch: "Kuntaa ei löytynyt. Kirjoita kunnan nimi.",
  regionUnsupported: "aluekohtaisia ohjeita ei vielä ole",
  regionBoundary: "Sijainti on lähellä kunnanrajaa tai liian epätarkka. Valitse kunta käsin.",
  regionUnavailable: "Aluetta ei saatu sijainnista. Voit valita kunnan käsin.",
  regionPrivacy:
    "Alue päätellään laitteessa. Sijaintia ei lähetetä eikä tallenneta. Kuntavalinta tyhjenee, kun appi siirtyy taustalle.",
  itemSearchTitle: "Esineen lajittelu",
  itemSearchEmpty: "Tälle haulle ei ole vielä tarkistettua esineohjetta.",
  itemSearchScope:
    "Haku kattaa sovellukseen lisätyt esineet ja materiaalit, ei kaikkia mahdollisia tuotteita.",
};
export const regionEn: Record<keyof typeof regionFi, string> = {
  regionConfirm: "Confirm municipality",
  regionNotSelected: "Guidance area: choose a municipality or use location",
  regionLocate: "Select area using location",
  regionManual: "Choose municipality manually",
  regionMunicipality: "Municipality name",
  regionNoMatch: "No municipality found. Enter its name.",
  regionUnsupported: "regional guidance not yet available",
  regionBoundary:
    "Your position is near a municipal border or too imprecise. Choose the municipality manually.",
  regionUnavailable: "Could not determine your area. Choose the municipality manually.",
  regionPrivacy:
    "Area is determined on device. Location is not sent or stored. The municipality selection clears when the app enters the background.",
  itemSearchTitle: "Item sorting",
  itemSearchEmpty: "No reviewed item guidance is available for this search yet.",
  itemSearchScope:
    "Search covers the items and materials added to this app, not every possible product.",
};
