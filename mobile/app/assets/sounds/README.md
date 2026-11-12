# Interface sound provenance

Four original short mono PCM cues, procedurally synthesized by
`scripts/generate-interface-sounds.mjs`. No recordings, voices, downloaded
samples, third-party melodies, network requests or generative service were used.
Their deterministic source is included; the repository's source-sharing terms
apply. These are interface feedback, not product-verification or impact claims.

| Cue | Intended use | Duration |
| --- | --- | --- |
| tap | Accepted deliberate action/barcode decode |35ms |
| ready | A requested operation completed; not identity certainty |140ms |
| confirm | A user-confirmed record was actually saved |200ms |
| attention | A recoverable operation problem, not an alarm |120ms |

Format:22050Hz/16-bit signed little-endian PCM/mono, standard44-byte WAV header.
Smooth symmetric envelopes, exact zero DC and zero endpoints; peaks below0.25
full scale. Per-player gain should remain conservative; system volume/silent
mode still govern playback. No loop, soundtrack, microphone or background audio
is needed. File byte checks do not certify listening comfort on physical devices.

Run `node scripts/generate-interface-sounds.mjs --check` for byte parity without
writing. A normal run creates only absent known assets. Existing matching bytes
are untouched; mismatched, linked or nonregular files abort rather than overwrite.
