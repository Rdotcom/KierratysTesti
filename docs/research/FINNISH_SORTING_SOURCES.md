# Finnish sorting-source review

November16extension: the original packaging engine/seed scope below is unchanged.
The separate explicit object-selection path now has additional small-metal,
battery/WEEE and HSY-only object/textile references and safe unknown boundaries:
see OBJECT_SELECTION_SORTING_SOURCES_2026-11-16.md. It is not an expansion of
automatic image-material inference or nationwide residual-waste rules.

Accessed: 2026-08-10. This is product research, not legal advice. Application rule text must remain an original concise summary with a source link.

## Nationwide packaging rules

Rinki states that packaging sorting instructions are nationwide: https://rinkiin.fi/lajittelu-kotona/lajitteluohjeet/.

### Plastic packaging

Source: https://rinkiin.fi/lajittelu-kotona/lajitteluohjeet/muovipakkausten-lajitteluohjeet/

- Applies to empty household plastic packaging, including food/detergent packages, bags/wraps, take-away packages/cups, and plastic packaging fillers.
- Easily detachable caps, lids, and pumps are placed separately in the collection container.
- Deposit plastic bottles go to retail return; containers with hazardous residues or pressure go to the local hazardous-waste reception point.
- The February 2025 update says small food stains do not prevent recycling and wiping is optional for odor control: https://rinkiin.fi/2025/02/25/helpotusta-arkeen-muovi-ja-kartonkipakkausten-lajitteluohjeet-on-paivitetty/.

### Carton packaging

Source: https://rinkiin.fi/lajittelu-kotona/lajitteluohjeet/kartonkipakkausten-lajitteluohjeet/

- Applies to empty household carton/paper packaging, including liquid cartons, boxes, bags/wrappers, tubes, pizza boxes, egg cartons, take-away packaging/cups, and carton fillers.
- Flatten before collection.

### Glass packaging

Source: https://rinkiin.fi/lajittelu-kotona/lajitteluohjeet/lasipakkausten-lajitteluohjeet/

- Applies only to empty household glass bottles and jars after caps/lids are removed; labels and collar rings can stay.
- Dirty packages may be cold-rinsed or wiped. Deposit bottles go to retail return.
- Drinking glass, porcelain, ceramics, crystal, window/mirror glass, lamps, and hazardous-residue packages are explicitly different flows.

### Metal

Source: https://rinkiin.fi/lajittelu-kotona/lajitteluohjeet/metallin-lajitteluohjeet/

- Accepts empty household metal packaging and small household metal.
- Deposit cans go to retail return. Pressurized or hazardous-residue packaging goes to hazardous-waste reception; objects larger than the collection opening follow municipal guidance.

## Deposit return

Source: https://www.palpa.fi/for-consumers/faq/

- Only containers included in a Finnish return system are deposit-return items; foreign or other containers cannot be inferred from material/shape alone.
- Palpa-managed deposit containers are returned empty, intact, in original shape, with label intact.
- Palpa covers cans, PET bottles, and some glass beverage bottles; some retailer systems are separate.

## Engine consequences

1. Require `isPackaging=true` for nationwide packaging destinations.
2. Evaluate known deposit return before material collection.
3. If a bottle/can could be deposit-bearing and status is unknown, return an ambiguous result asking the user to inspect the deposit mark/receipt or Palpa lookup.
4. Treat hazardous residue/pressure and non-packaging glass as explicit exceptions.
5. Keep collection-point availability separate from the sorting destination; the applicable nationwide rule can be known while the nearest location remains unknown.

## Seed-rule scope

The P0 verified seed set covers only common household plastic, carton/paper packaging, glass packaging, metal packaging/small metal, and known deposit containers in Finland. Composite packaging, biowaste, non-packaging paper, electrical items, batteries, hazardous waste, textiles, medicines, and municipality-specific residual/energy waste are safe-unknown until separately sourced.

Scope wording clarified on 2026-10-15 against the unchanged `fi.packaging.carton` rule, which already includes paper packaging; this is not a fresh external-source review or an extension to loose paper.
