import type { LocalizedText } from "@kierratysappi/domain";
import { z } from "zod";
import { sortPackagingComponent } from "./engine";
import { MATERIAL_RULES } from "./rules";
import type { SortingRuleReference } from "./types";
import { sortingRegionNames, type SortingRegionId } from "./sorting-region";

export const sortableObjectKinds = [
  "cup",
  "spoon",
  "fork",
  "knife",
  "bottle",
  "jar",
  "can",
  "carton",
  "bag",
  "battery",
  "phone",
  "textile",
  "remote",
  "electronics",
] as const;
export type SortableObjectKind = (typeof sortableObjectKinds)[number];
const inputSchema = z
  .object({
    kind: z.enum(sortableObjectKinds),
    answers: z.array(z.string().max(32)).max(6),
    evaluatedAt: z.iso.datetime(),
    region: z.enum(["hsy", "lsjh", "kiertokaari", "unsupported"]).optional(),
  })
  .strict();
type Reference = Omit<SortingRuleReference, "jurisdiction"> & {
  jurisdiction: "FI" | "FI-HSY" | "FI-LSJH" | "FI-Kiertokaari";
};
type Choice = { id: string; label: LocalizedText };
export type ObjectSortingStep =
  | {
      status: "question";
      id: string;
      title: LocalizedText;
      detail?: LocalizedText;
      choices: Choice[];
    }
  | {
      status: "guidance";
      destination: LocalizedText;
      preparation: LocalizedText;
      explanation: LocalizedText;
      exceptions: readonly LocalizedText[];
      sources: Reference[];
      confidence: "user_confirmed";
      verification: "user_confirmed";
    }
  | { status: "unknown"; explanation: LocalizedText; sources: Reference[] };
type Node =
  | Exclude<ObjectSortingStep, { status: "question" }>
  | {
      status: "question";
      id: string;
      title: LocalizedText;
      detail?: LocalizedText;
      choices: (Choice & { next: () => Node })[];
    };
const text = (fi: string, en: string): LocalizedText => ({ fi, en });
const source = (
  id: string,
  name: string,
  url: string,
  jurisdiction: Reference["jurisdiction"] = "FI",
): Reference => ({
  id,
  version: `${id}-2026-11-16.1`,
  jurisdiction,
  sourceName: name,
  sourceUrl: url,
  checkedAt: "2026-11-16",
  effectiveFrom: "2026-11-16",
  verificationStatus: "verified",
});
const metalSource = source(
  "fi.object.small-metal",
  "Suomen Pakkauskierrätys RINKI Oy",
  "https://rinkiin.fi/lajittelu-kotona/lajitteluohjeet/metallin-lajitteluohjeet/",
);
const ceramicSource = source(
  "hsy.object.ceramic",
  "HSY",
  "https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/jatteet/keramiikka/",
  "FI-HSY",
);
const glassSource = source(
  "hsy.object.glass",
  "HSY",
  "https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/jatteet/lasiesine/",
  "FI-HSY",
);
const plasticSource = source(
  "hsy.object.plastic",
  "HSY",
  "https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/jatteet/muoviesine/",
  "FI-HSY",
);
const batterySource = source(
  "fi.object.battery",
  "Paristokierrätys / Recser Oy",
  "https://www.paristokierratys.fi/paristokierratys/ukk/",
);
const phoneSource = source(
  "fi.object.phone",
  "SER-kierrätys",
  "https://serkierratys.fi/ser-kierratys/ohjeita-sahkolaitteiden-palauttajalle/",
);
const textileSource = source(
  "hsy.object.textile",
  "HSY",
  "https://www.hsy.fi/tekstiili/",
  "FI-HSY",
);
const unknown = (
  explanation = text(
    "Näillä tiedoilla ei voi valita keräysastiaa. Tarkista esine ja materiaali oman alueesi jäteoppaasta.",
    "These details are not enough to choose a collection bin. Check the item and material in your local waste guide.",
  ),
  sources: Reference[] = [],
): Extract<ObjectSortingStep, { status: "unknown" }> => ({
  status: "unknown",
  explanation,
  sources,
});
const guidance = (
  destination: LocalizedText,
  preparation: LocalizedText,
  explanation: LocalizedText,
  reference: Reference,
  exceptions: readonly LocalizedText[] = [],
): Node => ({
  status: "guidance",
  destination,
  preparation,
  explanation,
  exceptions,
  sources: [reference],
  confidence: "user_confirmed",
  verification: "user_confirmed",
});
const question = (
  id: string,
  title: LocalizedText,
  choices: (Choice & { next: () => Node })[],
  detail?: LocalizedText,
): Node => ({
  status: "question",
  id,
  title,
  choices,
  ...(detail ? { detail } : {}),
});
const choice = (id: string, fi: string, en: string, next: () => Node) => ({
  id,
  label: text(fi, en),
  next,
});
function regional(next: (region: SortingRegionId) => Node, region?: SortingRegionId): Node {
  if (region) return region === "unsupported" ? unknown() : next(region);
  return question(
    "region",
    text("Minkä alueen ohje?", "Which area's guidance?"),
    [
      choice("hsy", "HSY:n jätehuollon alue", "HSY waste-management area", () => next("hsy")),
      choice("lsjh", "Lounais-Suomen Jätehuolto", "Southwest Finland (LSJH)", () => next("lsjh")),
      choice("kiertokaari", "Kiertokaari", "Kiertokaari", () => next("kiertokaari")),
      choice("elsewhere", "Muu alue / en tiedä", "Elsewhere / not sure", () => unknown()),
    ],
    text(
      "Valitse oman jätehuoltoyhtiösi alue. Voit valita kunnan myös sijainnilla.",
      "Choose your waste operator's area. You can also select your municipality using location.",
    ),
  );
}
function ordinaryObject(
  material: string,
  kind?: SortableObjectKind,
  region?: SortingRegionId,
): Node {
  if (material === "metal" && kind && ["spoon", "fork", "knife"].includes(kind))
    return guidance(
      text("Metallinkeräys", "Metal collection"),
      text(
        "Laita metallinen aterin taloyhtiön metallinkeräysastiaan tai Rinki-ekopisteen metallinkeräykseen.",
        "Put the metal cutlery in your building's metal collection or a Rinki metal collection point.",
      ),
      text(
        "Metalliset lusikat, haarukat ja veitset kuuluvat pienmetalliin.",
        "Metal spoons, forks and knives are small household metal items.",
      ),
      { ...metalSource, version: "fi.object.cutlery-2026-11-16.1" },
    );
  if (material === "metal") {
    const receiver =
      region === "hsy"
        ? "HSY:n Sortti-asema"
        : region === "lsjh"
          ? "LSJH:n lajitteluasema, esimerkiksi Topinoja Turussa"
          : region === "kiertokaari"
            ? "Ruskon jätekeskuksen Oivapiste Oulussa"
            : undefined;
    const receiverEn =
      region === "hsy"
        ? "an HSY Sortti station"
        : region === "lsjh"
          ? "an LSJH sorting station, such as Topinoja in Turku"
          : "Oivapiste at Rusko waste centre in Oulu";
    const result = guidance(
      text("Metallinkeräys", "Metal collection"),
      text(
        receiver
          ? `Laita pieni metalliesine metallinkeräykseen. Astiaan sopimattomalle metalliesineelle vastaanotto on ${receiver}.`
          : "Laita pieni metalliesine metallinkeräykseen. Valitse kunta saadaksesi myös alueesi isojen metalliesineiden vastaanoton.",
        receiver
          ? `Put small metal items in metal collection. For a metal item that does not fit, use ${receiverEn}.`
          : "Put small metal items in metal collection. Select a municipality to see the reception for larger metal items in your area.",
      ),
      text(
        "Valitsit metallisen käyttöesineen. Ringin keräykseen kuuluu myös kodin pienmetallia, kuten aterimia.",
        "You selected a metal household item. Rinki also accepts small household metal items such as cutlery.",
      ),
      metalSource,
    );
    if (receiver && result.status === "guidance")
      result.sources.push(
        source(
          `${region}.object.metal-reception`,
          sortingRegionNames[region ?? "unsupported"],
          region === "hsy"
            ? "https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/jatteet/metalli/"
            : region === "lsjh"
              ? "https://lsjh.fi/jatelaji/metalli/"
              : "https://kiertokaari.fi/jate/aterimet-metalliset/",
          region === "hsy" ? "FI-HSY" : region === "lsjh" ? "FI-LSJH" : "FI-Kiertokaari",
        ),
      );
    return result;
  }
  if (
    (material === "ceramic" || material === "glass" || material === "plastic") &&
    region &&
    region !== "hsy"
  ) {
    return regionalItem(material, region);
  }
  if (material === "ceramic" || material === "glass")
    return regional(
      (selected) =>
        selected !== "hsy"
          ? regionalItem(material, selected)
          : guidance(
              text("Sekajäte · HSY", "Mixed waste · HSY"),
              text(
                "Yksittäinen käytöstä poistettu astia tai sen kappaleet sekajätteeseen. Suuret määrät Sortti-aseman palamattoman jätteen vastaanottoon. Ei lasipakkausten keräykseen.",
                "Put a single discarded vessel or its pieces in mixed waste. Take large quantities to Sortti's non-combustible waste reception. Not glass-packaging collection.",
              ),
              text(
                "Valitsit lasisen tai keraamisen käyttöesineen ja HSY:n alueen. Käyttöesine ei ole lasipakkaus.",
                "You selected a glass or ceramic household item and the HSY area. A household item is not glass packaging.",
              ),
              material === "ceramic" ? ceramicSource : glassSource,
            ),
      region,
    );
  if (material === "plastic")
    return regional(
      (selected) =>
        selected !== "hsy"
          ? regionalItem(material, selected)
          : guidance(
              text(
                "Sekajäte tai Sortti-aseman muovinkeräys · HSY",
                "Mixed waste or Sortti plastic collection · HSY",
              ),
              text(
                "Pieni käytöstä poistettu kovamuovinen käyttöesine sekajätteeseen tai Sortti-aseman muovinkeräykseen. Ei muovipakkausten keräykseen.",
                "Use mixed waste or Sortti plastic collection for a small discarded rigid-plastic item. Not plastic-packaging collection.",
              ),
              text(
                "Valitsit muovisen käyttöesineen, et pakkausta, ja HSY:n alueen.",
                "You selected a plastic household item, not packaging, and the HSY area.",
              ),
              plasticSource,
            ),
      region,
    );
  return unknown();
}
function regionalItem(material: string, region: SortingRegionId): Node {
  if (region !== "lsjh" && region !== "kiertokaari") return unknown();
  const operator = sortingRegionNames[region];
  const url =
    region === "kiertokaari"
      ? "https://kiertokaari.fi/jatelaji/sekajate-kiinteistolta/"
      : material === "plastic"
        ? "https://lsjh.fi/jate/muoviesine/"
        : material === "ceramic"
          ? "https://lsjh.fi/jate/astia-keraaminen/"
          : "https://lsjh.fi/jate/lasiesine-lasiastia/";
  const ref = source(
    `${region}.object.${material}`,
    operator,
    url,
    region === "lsjh" ? "FI-LSJH" : "FI-Kiertokaari",
  );
  return guidance(
    text(
      region === "lsjh" && material === "ceramic"
        ? `Sekajäte tai astiakeramiikan vastaanotto · ${operator}`
        : `Sekajäte · ${operator}`,
      region === "lsjh" && material === "ceramic"
        ? `Mixed waste or ceramic collection · ${operator}`
        : `Mixed waste · ${operator}`,
    ),
    text(
      region === "lsjh" && material === "ceramic"
        ? "Laita rikkinäinen keraaminen astia kodin sekajätteeseen tai vie se LSJH:n lajitteluaseman astiakeramiikan keräykseen, esimerkiksi Turun Topinojan lajitteluasemalle."
        : region === "kiertokaari"
          ? material === "plastic"
            ? "Laita pieni muovinen käyttöesine kodin sekajäteastiaan. Se ei kuulu muovipakkausten keräykseen."
            : "Laita yksittäinen pieni käytöstä poistettu esine kodin sekajäteastiaan. Lasia ja keramiikkaa saa olla enintään 5 kg tyhjennyskertaa kohti. Ei lasipakkausten keräykseen."
          : "Laita yksittäinen pieni käytöstä poistettu esine kodin sekajäteastiaan. Vie suuremmat erät LSJH:n lajitteluasemalle, esimerkiksi Turun Topinojan lajitteluasemalle. Ei lasi- tai muovipakkausten keräykseen.",
      region === "lsjh" && material === "ceramic"
        ? "Put broken ceramic tableware in household mixed waste or take it to ceramic collection at an LSJH sorting station, such as Topinoja in Turku."
        : region === "kiertokaari"
          ? material === "plastic"
            ? "Put a small plastic household item in household mixed waste, not plastic-packaging collection."
            : "Put a single small discarded item in household mixed waste. Glass and ceramics are limited to 5 kg per collection. Not glass-packaging collection."
          : "Put a single small discarded item in household mixed waste. Take larger quantities to an LSJH sorting station, such as Topinoja in Turku. Not glass or plastic packaging collection.",
    ),
    text(
      "Ohje koskee valitsemaasi käyttöesinettä ja valittua jätehuoltoaluetta, ei pakkausta.",
      "This guidance applies to your selected household item and waste-management area, not packaging.",
    ),
    ref,
  );
}
function packaging(
  kind: SortableObjectKind,
  material: "plastic" | "glass" | "metal" | "carton",
  deposit: boolean,
  now: string,
): Node {
  const provenance = {
    sourceId: "object-user-selection",
    sourceName: "User-selected object, material and packaging conditions",
    sourceRecordId: "transient-object-selection",
    sourceUrl: "https://kierratysappi.local/object-selection",
    retrievedAt: now,
    lastConfirmedAt: now,
    confidence: 0.65,
    verificationStatus: "user_confirmed" as const,
    license: {
      id: "private-local-observation",
      name: "Private local observation",
      attributionText: "User choices on this device, not verified image recognition",
      shareAlike: false,
    },
  };
  const observed = <T>(value: T) => ({ value, provenance });
  const shape = kind === "bottle" || kind === "jar" || kind === "can" ? kind : "unknown";
  const result = sortPackagingComponent({
    component: {
      id: "user-selected-object",
      packagingStatus: observed("packaging"),
      materialFamily: observed(material),
      shape: observed(shape),
      depositReturnStatus: observed(deposit ? "yes" : "no"),
      conditions: { emptied: "yes", hazardousResidue: "no", pressurized: "no" },
    },
    context: { country: "FI", language: "fi", evaluatedAt: now },
  });
  return result.status === "resolved"
    ? guidance(
        result.destination.label,
        result.preparation,
        result.explanation,
        result.rule,
        result.exceptions,
      )
    : unknown();
}
function packagingUse(
  kind: SortableObjectKind,
  material: string,
  now: string,
  region?: SortingRegionId,
): Node {
  if (!["plastic", "glass", "metal", "carton"].includes(material))
    return ordinaryObject(material, kind, region);
  const supported = material as "plastic" | "glass" | "metal" | "carton";
  return question(
    "use",
    text("Onko tämä pakkaus vai käyttöesine?", "Is this packaging or a household item?"),
    [
      ...((kind === "bottle" || kind === "can") && material !== "carton"
        ? [
            choice(
              "deposit",
              "Pantillinen juomapakkaus",
              "Finnish deposit beverage container",
              () => packaging(kind, supported, true, now),
            ),
          ]
        : []),
      choice("packaging", "Tyhjä, pantiton pakkaus", "Empty non-deposit packaging", () =>
        packaging(kind, supported, false, now),
      ),
      choice("item", "Käyttöesine, ei pakkaus", "Household item, not packaging", () =>
        ordinaryObject(material, kind, region),
      ),
      choice("unsafe", "Jäämiä, painetta tai epäselvä", "Residue, pressure or not sure", () =>
        unknown(
          text(
            "Älä laita vaarallisia jäämiä tai painetta sisältävää pakkausta tavalliseen keräykseen. Tarkista paikallinen vaarallisen jätteen ohje; epäselvässä tapauksessa kysy vastaanottajalta.",
            "Do not use ordinary collection for packaging with hazardous residue or pressure. Check local hazardous-waste guidance; ask the receiver if unsure.",
          ),
          MATERIAL_RULES.filter((rule) => rule.materials.includes(supported)).map(
            (rule) => rule.reference,
          ),
        ),
      ),
    ],
    text(
      "Pakkausvalinta tarkoittaa tyhjää kotitalouspakkausta ilman vaarallisia jäämiä tai painetta. Vahvista suomalainen pantti merkistä tai Palpan hausta.",
      "A packaging choice confirms empty household packaging without hazardous residue or pressure. Verify a Finnish deposit using the mark or Palpa lookup.",
    ),
  );
}
function tree(kind: SortableObjectKind, now: string, region?: SortingRegionId): Node {
  if (kind === "phone" || kind === "remote" || kind === "electronics")
    return guidance(
      text("Sähkölaitteiden keräys (SER)", "Electrical and electronic equipment collection (WEEE)"),
      text(
        "Vie käytöstä poistettu sähkölaite sähkölaitteiden keräykseen. Irrota helposti irtoavat paristot erikseen paristokeräykseen. Älä irrota sisäänrakennettua akkua väkisin. Poista mahdolliset omat tiedot valmistajan ohjeella.",
        "Return the discarded electrical device to WEEE collection. Remove easily detachable batteries for separate battery collection. Do not force out an embedded battery. Remove any personal data using the manufacturer's instructions.",
      ),
      text(
        "Kaukosäädin ja muut sähkölaitteet kuuluvat sähkölaitekeräykseen, eivät muovi- tai metallipakkausten keräykseen.",
        "Remote controls and other electrical devices belong in WEEE collection, not plastic or metal packaging collection.",
      ),
      phoneSource,
    );
  if (kind === "battery")
    return question(
      "battery-type",
      text("Millainen paristo tai akku?", "What type of battery?"),
      [
        choice(
          "small",
          "Tavallinen ehjä paristo tai pienakku",
          "Ordinary intact portable battery",
          () =>
            guidance(
              text("Paristojen ja pienakkujen keräys", "Portable battery collection"),
              text(
                "Teippaa virtanavat ja palauta paristoja myyvän kaupan keräykseen. Älä laita metallin- tai sekajätteeseen.",
                "Tape the terminals and return to a battery retailer's collection. Not metal or mixed waste.",
              ),
              text(
                "Valitsit ehjän pariston tai pienakun. Se kerätään erillään muusta jätteestä.",
                "You selected an intact portable battery. It is collected separately from other waste.",
              ),
              batterySource,
            ),
        ),
        choice(
          "other",
          "Iso, vaurioitunut tai epäselvä akku",
          "Large, damaged or uncertain battery",
          () =>
            unknown(
              text(
                "Tarkista akun vastaanotto etukäteen ja kysy henkilökunnalta käsittelyohje. Älä laita isoa liikkumisvälineen akkua tavalliseen kaupan paristolaatikkoon.",
                "Check reception and handling with staff first. Do not put a large mobility battery in an ordinary retailer battery box.",
              ),
              [batterySource],
            ),
        ),
      ],
      text(
        "Tavallinen pienakku ei tarkoita sähköpyörän tai muun liikkumisvälineen akkua. Valitse niille alempi vaihtoehto.",
        "An ordinary portable battery does not include an e-bike or other mobility battery. Choose the second option for those.",
      ),
    );
  if (kind === "textile")
    return regional(
      (selected) =>
        selected !== "hsy"
          ? unknown(undefined, [textileSource])
          : question(
              "textile-condition",
              text("Millainen tekstiili?", "What condition is the textile in?"),
              [
                choice("reusable", "Puhdas ja käyttökelpoinen", "Clean and reusable", () =>
                  guidance(
                    text("Uudelleenkäyttö", "Reuse"),
                    text(
                      "Myy tai lahjoita käyttökelpoinen vaate tai kodintekstiili. Tarkista vastaanottajan ehdot.",
                      "Sell or donate reusable clothing or household textiles. Check the receiver's conditions.",
                    ),
                    text(
                      "Valitsit käyttökelpoisen tekstiilin. Se ei kuulu poistotekstiilikeräykseen.",
                      "You selected a reusable textile. It does not belong in end-of-life textile collection.",
                    ),
                    textileSource,
                  ),
                ),
                choice(
                  "worn",
                  "Kuiva, puhdas, loppuun kulunut vaate tai kodintekstiili",
                  "Dry, clean, worn-out clothing or household textile",
                  () =>
                    guidance(
                      text("Poistotekstiilikeräys · HSY", "End-of-life textile collection · HSY"),
                      text(
                        "Pakkaa kuivana suljettuun muovipussiin. Ei alusvaatteita, sukkia, kenkiä, mattoja, peittoja, tyynyjä tai likaisia, märkiä, homeisia tai tuholaisia sisältäviä tekstiilejä.",
                        "Pack dry in a closed plastic bag. Excludes underwear, socks, shoes, rugs, duvets, pillows and dirty, wet, mouldy or pest-infested textiles.",
                      ),
                      text(
                        "Valitsit HSY:n alueen ja keräykseen soveltuvan loppuun kuluneen tekstiilin. Tarkista poikkeukset.",
                        "You selected the HSY area and a suitable worn-out textile. Check the exclusions.",
                      ),
                      textileSource,
                    ),
                ),
                choice("other", "Muu / en tiedä", "Other / not sure", () =>
                  unknown(undefined, [textileSource]),
                ),
              ],
            ),
      region,
    );
  const labels = {
    metal: text("Metalli", "Metal"),
    ceramic: text("Keramiikka tai posliini", "Ceramic or porcelain"),
    glass: text("Lasi", "Glass"),
    plastic: text("Muovi", "Plastic"),
    carton: text("Kartonki tai paperi", "Carton or paper"),
    wood: text("Puu", "Wood"),
  };
  const cutlery = ["spoon", "fork", "knife"].includes(kind);
  const materials = cutlery
    ? (["metal", "plastic", "wood", "ceramic"] as const)
    : kind === "cup"
      ? (["ceramic", "glass", "metal", "plastic", "carton"] as const)
      : (["plastic", "glass", "metal", "carton", "ceramic"] as const);
  return question(
    "material",
    text("Mitä materiaalia esine on?", "What is the item made of?"),
    [
      ...materials.map((material) => ({
        id: material,
        label: labels[material],
        next: () =>
          cutlery || (kind === "cup" && material !== "carton" && material !== "plastic")
            ? ordinaryObject(material, kind, region)
            : packagingUse(kind, material, now, region),
      })),
      choice("unknown", "En tiedä / muu materiaali", "Not sure / another material", () =>
        unknown(),
      ),
    ],
    text(
      "Valitse itse. Kuvamalli ei varmista materiaalia. Ohje koskee valitsemaasi osaa, ei koko monimateriaalista tuotetta.",
      "Choose yourself. The image model does not verify material. Guidance applies to the part you choose, not an entire multi-material product.",
    ),
  );
}

/** Only explicit local choices enter policy. Model scores and photos are never inputs. */
export function evaluateObjectSorting(input: unknown): ObjectSortingStep {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || Date.parse(parsed.data.evaluatedAt) < Date.parse("2026-11-16T00:00:00Z"))
    return unknown();
  let node = tree(parsed.data.kind, parsed.data.evaluatedAt, parsed.data.region);
  for (const answer of parsed.data.answers) {
    if (node.status !== "question") return unknown();
    const selected = node.choices.find((option) => option.id === answer);
    if (!selected) return unknown();
    node = selected.next();
  }
  if (node.status !== "question") return node;
  return { ...node, choices: node.choices.map(({ id, label }) => ({ id, label })) };
}
