# Acceptance criteria

- Preserve mobile/backend/shared boundaries, strict contracts and versioned rules.
- Validate GTIN and external data; keep sources, jurisdiction, dates, version,
  uncertainty and explanation in every sorting answer. No guessed acceptance.
- Barcode/manual/guide/location/history/marking flows recover from unknown,
  offline, permission denial, timeout and missing provider data.
- Native processing remains local. Go/browser sends a bounded metadata-free
  image only after preview and separate consent to the visible server.
- FI/EN persists until changed; labels/focus/large text/dark/reduced motion work.
- Full validation, Expo health, relevant real-model/browser and platform/device
  checks must pass with scope recorded. Keep audit failures visible, never waived.
- Cleanup preserves app/model/data bytes, test coverage and required licences,
  leaves no broken current-doc links, and keeps historical files recoverable.
