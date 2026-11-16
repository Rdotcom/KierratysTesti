# Object-selection sorting sources

Accessed 2026-11-16. This extends the **separate, user-confirmed object path**;
it does not silently expand the existing packaging API's v1 schema or claim
that SigLIP recognizes materials. No provider scrape, copied image, training
data, source-prose reproduction or paid request is involved. Short original FI/EN
summaries and per-answer source links are bundled for offline use; opening a
source link still needs internet. No publisher endorsement is claimed.

| Source | Verified scope used by the new path | Boundary |
| --- | --- | --- |
| [Rinki: metal](https://rinkiin.fi/lajittelu-kotona/lajitteluohjeet/metallin-lajitteluohjeet/) | Small household metal, including cutlery; fit through opening, larger items follow municipal guidance | FI; no battery/electronics in metal; not a material inference |
| [HSY: ceramic](https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/jatteet/keramiikka/) | Single ceramic items/pieces in property mixed waste; large quantities in Sortti non-combustible waste | Explicit HSY-area selection required; not a nationwide residual-waste rule |
| [HSY: glass objects](https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/jatteet/lasiesine/) | Single non-packaging glass objects in mixed waste; larger quantities to Sortti; excluded from glass-packaging collection | Explicit HSY-area selection required; old attempted `/juomalasi/` URL inaccessible, not used |
| [HSY: rigid-plastic objects](https://www.hsy.fi/jatteet-ja-kierratys/jateopas-ja-lajitteluohjeet/jatteet/muoviesine/) | Small rigid-plastic household objects: mixed waste or Sortti plastic reception, not packaging bins | Only after non-packaging and HSY choices; not all polymers/composites |
| [Paristokierrätys / Recser FAQ](https://www.paristokierratys.fi/paristokierratys/ukk/) | Tape terminals; ordinary portable batteries to retailer collection; large mobility/damaged/uncertain cases need receiver-specific instructions | Battery-type question; no automatic retail-box instruction for every battery |
| [SER: return instructions](https://serkierratys.fi/ser-kierratys/ohjeita-sahkolaitteiden-palauttajalle/) | Discarded electrical devices to WEEE; packaging removed; no forced removal of embedded battery | Phone selection is sufficient; casing material is irrelevant; factory data-removal instructions remain manufacturer-specific |
| [HSY: textiles](https://www.hsy.fi/tekstiili/) | Reuse versus clean/dry worn-out clothing/household textile; exclusions and closed bag | HSY area and condition required; socks/underwear/rugs/shoes/duvets/pillows/contaminated textiles not blanket accepted |

New references have checked date 2026-11-16, explicit version and FI or FI-HSY
jurisdiction. “Verified” describes the source-backed rule, **not** verified
recognition or externally certified material. Result confidence/verification is
`user_confirmed`, not an invented calibrated probability.

Packaging answers reuse the existing `sortPackagingComponent` engine and its
original Rinki/Palpa references/dates/version. The new source check above covers
small metal, not a retrospective re-review of every packaging rule. Deposit is
an explicit Finnish-system confirmation, never inferred from bottle shape.
Empty household packaging/no hazardous residue/no pressure are stated conditions
of the packaging choice. Unknown/unsafe/unsupported material or non-HSY region
without a matching rule returns unknown, not a guessed bin. Wood remains unknown.

Failed source navigation and QA setup failures are retained in the local run
evidence; no inaccessible URL is treated as support for a new rule. No additional
human/legal-review approval requirement is introduced by this source check.
