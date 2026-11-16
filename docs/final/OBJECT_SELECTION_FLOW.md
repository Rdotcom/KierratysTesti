# Object suggestions → choices → sorting guidance

November16 owner request: make AI suggestions actionable buttons, asking material
where needed before showing a sorting destination. No model retraining, new
image inference, paid/cloud request or provider change.

## Interaction review

| Before | After | Why |
| --- | --- | --- |
| Three names joined as plain text | Up to three ranked, labelled buttons plus “None of these” | A clear action without accepting the model's first guess |
| Generic material-guide detour | One relevant question at a time; instant existing Button feedback, no new animation | Keep the answer path short and usable with reduced motion/keyboard |
| No object-specific sorting result | Explicit material/use/area/type choices feed shared policy, then a source-backed result or unknown | Never infer packaging/material/deposit/area from appearance |
| A new picture could tempt reuse of old answers | Selection is tied to exact result identity; back/change rebuild from current answers | A changed object/material cannot retain an obsolete destination |

Examples: spoon→metal→small-metal guidance; cup→ceramic→HSY→regional mixed
waste; bottle→plastic→Finnish deposit versus empty non-deposit packaging versus
household item. Phone goes to WEEE without asking casing material. Batteries ask
type; textiles ask area/condition. Wood/unknown/unsafe/non-HSY without a supported
rule remain explicit unknown. User choices describe one selected component, not
a guaranteed whole multi-material product. No automatic storage/history entry.

Existing packaging/GTIN/catalogue/byte/model/decoder/rule priority is unchanged.
The old packaging engine is reused only after explicit package conditions and
deposit answer; glass cups never become glass packaging. Shared v1 API schemas
are unchanged. The new policy's strict bounded input excludes image/model scores;
source links, jurisdiction, checked date, rule version, verification, confidence
and explanation stay with the result. Confidence is a user-confirmed assumption,
not model probability. Source register:
`docs/research/OBJECT_SELECTION_SORTING_SOURCES_2026-11-16.md`.

## Evidence and limits

- 28 new shared-policy tests, including complete reachable-branch traversal,
  bilingual/source metadata, region/packaging/deposit/battery/unsafe/unknown and
  invalid/extra-answer inputs. Five mobile candidate-action tests preserve rank,
  deduplicate/bound choices and reject multiple/unknown/unavailable cases.
- Actual production component in an isolated **synthetic suggestion** browser
  host: FI/EN × light/dark,390/320px, normal/1.3×/2× simulated text, reduced motion.
  Offline choices, keyboard Enter, back/change, wrong-region abstention, deposit/
  non-packaging separation, same-timestamp new-result reset and multiple recovery
  pass.44px targets/no horizontal overflow, zero page errors/external requests.
  Sixteen full-page screenshots captured; four representative states visually
  inspected (choices/metal/FI dark ceramic/EN dark200% packaging question).
- Final browser evidence:
  `work/object-choice-browser-final-20261116.qZLoQy/`; first successful visual
  review at `work/object-choice-browser-20261116.zYFTCk/`. Initial missing web
  extension resolution was repaired with official `.web` module selection;
  only unused router dependency is QA-stubbed, not the result component/policy.
- First shared typecheck caught a missing test union guard; fixed, not waived.
  Full lint caught missing QA HTML button types; fixed. Earlier logs retained in
  `work/object-choices-20261116.jfPpoP/`. Production uses existing accessible
  Button/InlineLink/theme; iOS announcements, polite result heading and no timed
  animation. Simulated browser text is not physical Dynamic Type/VoiceOver proof.

Software/native delivery results are recorded in TEST_EVIDENCE.md. Browser
and shared/mobile/full validation pass:2015tests(920Node+1095workspace), allchecks/
builds/18web routes,19existing warnings. Signed normal0.1.0(15) installed/launched,
11embedded signatures/14legacy pins/candidate/JPEG/privacy preserved, no QA
fixtures/probe. New controls/rule IDs confirmed in actual Hermes. Existing profile
expires23November12:53:38Helsinki; no renewal/reset. Owner replies “toimii” to
the installed15spoon→Lusikka→Metalli and back/change smoke request. This confirms
basic physical interaction, not exact text/step counts, retake, VoiceOver or broad
recognition accuracy. Retake reset remains browser-tested only. Receipts:
`work/object-choice-client15-20261116.6464yZ/`.

Browser fixtures are not new camera/model-accuracy evidence. Physical selection-flow
acceptance remains separate from build/install/launch. Previous recognition
quality, Android/Samsung, clean-checkout models, MEM-01 memory/energy/pressure
and store NO-GO gates remain open. No GitHub push or production release.
