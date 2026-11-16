# Leaf launcher icon — November16, 2026

`leaf-mark-v1.png` is a transparent, faithful generated extraction/upscale of the
leaf-recycling symbol in the owner-supplied `backgrounds/welcome-background.png`,
made with the built-in imagegen tool. It is not a pixel-identical crop. Original
Home artwork/crop is unchanged. No credential screenshot was an image input.
Exact prompt/source provenance and validation: `docs/final/LEAF_ICON_AND_HSY_SETUP.md`.

Master1254×1254RGBA SHA256:
`bb137dfe7cd1e1a4062a52acf2ae19e167ad44d3b0da1751ea7c28274dcd08b0`.
Owner artwork SHA256:
`e848d48323ba50a1930b861bedcdd8546449f4bcd27543bcc28af2ed59de96e0`.
This retains the existing owner-artwork provenance/rights limitations; no new
third-party trademark/licence clearance or store approval is claimed.

`scripts/render-leaf-app-icons.mjs` mechanically compiles the committed master:

- `leaf-app-icon.png`:1024×1024RGB, opaque pale canvas#F4FAF5,768pxmark.
- `leaf-adaptive-foreground.png`:1024×1024RGBA,480pxmark/transparent margins;
  all visible pixels inside the unchanged332pxsafe-circle radius.
- `leaf-adaptive-monochrome.png`:identical alpha silhouette, black RGB.
- `leaf-favicon.png`:64×64opaque.

Run with installed Sharp via `SHARP_MODULE_PATH`, `--check` for exact byte parity
or `--write` to replace only these known generated outputs. No network/runtime
package added. Source/output hash tests and alpha/safe-area checks guard drift.
The initial620pxadaptive export failed safe-circle checks; it was reduced to480,
not accepted by weakening the safe area. iOS icon was unchanged by this repair.

Existing older `app-icon.svg`, adaptive SVGs and their old `assets/images/` PNGs
remain as legacy/recovery assets, not current launcher inputs. Existing splash
asset is unchanged; this request updates app/launcher/favicon, not all artwork.
