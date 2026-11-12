export const soundFeedbackFi = {
  soundFeedbackTitle: "Äänipalautteet",
  soundFeedbackBody:
    "Lyhyet merkit skannauksesta, toiminnon valmistumisesta ja tallennuksesta. Ei ääniä hiljaisessa tilassa tai ruudunlukijan kanssa.",
  soundFeedbackOn: "Käytössä",
  soundFeedbackOff: "Pois käytöstä",
  soundFeedbackLoading: "Luetaan asetusta…",
  soundFeedbackError:
    "Asetusta ei voitu tallentaa tai lukea. Äänet ovat pois käytöstä. Yritä uudelleen.",
  soundFeedbackUnavailable:
    "Äänipalautteet eivät ole käytettävissä tässä asennuksessa. Muut toiminnot toimivat normaalisti.",
} as const;
export const soundFeedbackEn: Record<keyof typeof soundFeedbackFi, string> = {
  soundFeedbackTitle: "Sound feedback",
  soundFeedbackBody:
    "Brief cues for scans, completed actions and saved records. Silent in silent mode and when a screen reader is active.",
  soundFeedbackOn: "On",
  soundFeedbackOff: "Off",
  soundFeedbackLoading: "Reading preference…",
  soundFeedbackError: "Could not save or read the preference. Sounds are off. Try again.",
  soundFeedbackUnavailable:
    "Sound feedback is unavailable in this installation. Other features work normally.",
};
