# Local recognition: decision-specific research, November14

Official [Vision feature-print sample](https://developer.apple.com/documentation/vision/analyzing-image-similarity-with-feature-print)
describes measuring image distance, not guaranteed product/GTIN recognition.
[Create ML accuracy guide](https://developer.apple.com/documentation/createml/improving-your-model-s-accuracy)
distinguishes training/validation/testing, recommends diverse data when evaluation
differs, and lists rotation/cropping/exposure augmentation. Official Markdown
versions accessed2026-11-14. Generic guidance does not validate our recognizer.

Own matching algorithms plus existing offline Apple2024MobileCLIP need no
per-query API payment, but are not an own-trained universal foundation model.
The actual expanded experiment fails coverage; calling code final cannot remove
data/appearance/variant ambiguity. Sideways Barilla with weak original-view
embeddings suggests a specific orientation-consensus hypothesis. Keep fixed
per-view two-reference/safety/uncertainty gates, not outcome-tuned relaxation.
Nutella size still needs distinct evidence. More diverse data/text evidence is
local engineering if rotation does not meet the registered useful-coverage gate.

Data-quality skill influences retained denominators, seen/new scope and preserved
failure receipts; it introduces no new human checker. Existing Markdown/scripts
are the engineering deliverable, not a new notebook/dashboard or publication.

## Executed orientation hypothesis and API check

[Sharp operation docs](https://sharp.pixelplumbing.com/api-operation/#autoorient),
accessed2026-11-14, specify EXIF auto-orientation before explicit rotation and a
single explicit angle per pipeline. Pinned0.35.5uses autoOrient().rotate(angle),
metadata-free JPEGs and white sRGB. Actual rotated Barilla image is observed;
orientation experiment preserves all58queries and fails unchanged at7/17.
Thus the plausible rotation hypothesis is not a demonstrated coverage fix;
do not ship the fourfold query work as an improvement. Source-bound OCR quantity/
name corroboration and reference/background diversity are next testable options,
not already demonstrated reliable recognition. Exact hidden size cannot be read
from code alone, and no API/licence/documentation claim changes that limitation.
