# Location and recycling-record polish — 17 November 2026

Scope: owner-requested quiet UI, compact Location tab, material-first point
selection and explicit recycling records throughout guidance. This is a source
delivery, not a new native installation or public-store GO.

## UI review

| Before | After | Why |
| --- | --- | --- |
| Pisteet / Points, large repeated cards | Sijainti / Location; compact identity, distance, reported-material chips, map/details actions | Keep the useful decision visible; preserve long names and 44 pt targets. |
| Five closest points irrespective of material data | Five nearest points with reported materials; category filters search the whole bundled directory | A closer unknown point must not displace a useful reported point. |
| Unknown acceptance mixed into recommendations | Explicit optional incomplete-points section, with a warning | Do not fabricate acceptance or hide the directory's limitations. |
| Material code requires Check and “I see this code” | Check directly evaluates the typed/edited code and reveals its result | A query/OCR suggestion still only prefills; no unsolicited sorting or recording. |
| Recycling records mainly for packaging | Explicit records in object, source-guide, generic-material, photo, barcode and point-detail flows | A user can record an item they actually recycled, not just a package part. |
| Audio cues, preference, driver and assets | No custom audio/haptic feature, dependency, plugin, preference UI or sound assets | Quiet operation; visual and screen-reader feedback remain. |

The redesign/polish skills informed information hierarchy, compact cards and
progressive disclosure, without adding decorative motion or changing the
existing visual language. FI/EN Overview copy now refers to items/packages rather
than pretending every recycled object is a packaging part.

## Data, uncertainty and privacy

- Filters use only normalized `reportedMaterials`, with explicit exclusions.
  Names, operators, distance and object guesses never imply acceptance. Each
  group shows the individual source-reported materials, not a blanket promise
  that every object in that group belongs there. No invented opening hours.
- Distances remain estimates within the directory's 100 km radius. Filtering
  stores no raw device coordinates and does not reacquire location. Existing
  denial, timeout, blur/background cancellation and optional-address disclosure
  remain. Source, date, community/unverified status and ODbL attribution remain.
  A point-detail recycling record uses a generic label, not the point name,
  address, coordinates or source identifier, so it is not a visit-location log.
- Records are explicitly self-reported after physical recycling. Known,
  supported material answers can be reused; otherwise a material choice is
  mandatory. Unknown does not default to “Other”. This never upgrades a model
  suggestion, changes a sorting rule or verifies material acceptance.
- Repeated clicks/retries use the same intent. Photo identity and object choices
  share one capture intent; switching guesses cannot count one capture twice.
  Existing v1 totals/history, delete/export behavior and language persistence
  are preserved; no storage migration or provider/model/rule change.
- Four original WAVs, the sound generator/driver/controller/storage/provider,
  localization and sound-specific tests were deleted. `expo-audio` and
  `expo-haptics` were removed from package/lock/config. Those files are recoverable
  from Git history. Unused old sound-preference bytes may remain in an existing
  OS app sandbox; nothing reads them and no active sound feature remains.

## Verification and limits

See the current section of `TEST_EVIDENCE.md` for commands, results and retained
first failures. Browser QA uses the actual exported app; the object component
host supplies explicitly synthetic choices and is not an image-accuracy test.
No user photographs, actual user GPS, paid inference or secret values were used.

Native source/config changes need new native builds to remove linked modules
from installed binaries. Installed iPhone21/Android7 are previous-unit evidence,
not proof of this source revision. Physical Samsung, native assistive technology,
MEM-01, recognition coverage, release assets and store gates remain open.
