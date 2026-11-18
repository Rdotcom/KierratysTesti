import { z } from "zod";

// Strict browser CSP intentionally forbids eval/new Function. The interpreted
// validator keeps the same runtime checks without generating executable code.
z.config({ jitless: true });
