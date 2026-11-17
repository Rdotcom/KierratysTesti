# KierrätysAppi repository rules

## Product and architecture

- Never present uncertain identity, material or sorting inference as verified.
  Every sorting answer retains source, jurisdiction, checked date, rule version,
  verification status, confidence and explanation.
- `mobile/` owns UI/device state/localization; `backend/` owns API/providers/
  database; `shared/` owns pure contracts/domain/rules. Read each area's AGENTS.md.
  Mobile/backend do not import one another; shared imports neither consumer.
- Use declared public exports. Avoid dependency cycles, provider-shape leakage
  and duplicated contracts. Product identity, observations and policy are separate.
- Strict TypeScript; no `any`, runtime validation at external boundaries.
  Kebab-case files except framework routes; English code vocabulary and FI/EN UI.

## Quality and safety

- Behavior changes include tests and safe unknown/offline/error recovery.
  Run narrow tests while repairing and `pnpm validate` before completing a unit.
  Keep GTIN, provenance, permissions, localization, accessibility and reduced-motion
  coverage. Do not remove tests or weaken gates to obtain green results.
- Never read, print, commit or expose secrets. Service keys stay server-side;
  commit only environment examples. Raw photos, precise location, free text and
  scan history are excluded from analytics by default. Anonymous local use.
- Bound inputs/payloads/decode, strip image metadata where applicable, rate-limit
  public APIs, authorize admin operations and keep personal data out of logs.
- Do not claim device/native/store readiness without corresponding evidence.
  Retain known high audit findings; a source publication is not production GO.
- Follow source licences and retain attribution/provenance. Do not fabricate
  matches, locations, partners, metrics or sorting guidance. Separate packaging,
  non-packaging, deposit return and local acceptance.
- Use concise original guidance, never inferred nationwide acceptance. Rule
  changes require authoritative source, review date and version.
- Target WCAG 2.2 AA principles: labels/focus, dynamic text, 44pt targets,
  contrast, non-color status, reduced motion and accessible error recovery.

## Repository and documentation

- Inspect actual remote URL and branch before every push. KeepItGreen is the
  experimentation/archive repository; team KierratysAppi publication needs
  explicit owner authorization for that step. No mirrors, force pushes, private
  branch ancestry or automatic cross-repository synchronization.
- Owner-authorized cleanup on 2026-11-17 archives historical documents in
  KeepItGreen before removal. Keep this repository focused on the working app,
  tests, build tools, required licences and short current setup documentation.
  Do not restore long agent diaries, school scripts or generated reports here.
- Read docs/project/CURRENT_STATE.md and NEXT_ACTION.md before broad exploration.
  After meaningful units update CURRENT_STATE, DECISIONS, ROADMAP, exactly one
  executable NEXT_ACTION, relevant evidence in docs/testing.md and real external
  blockers in EXTERNAL_BLOCKERS. Keep these files short and current.
- A feature is done only with behavior, safe failure, accessibility, privacy,
  proportionate tests and relevant visual/device evidence. Legal drafts and
  unavailable integrations must not masquerade as production functionality.
