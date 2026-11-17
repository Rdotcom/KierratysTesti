import { z } from "zod";

const ApiEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  OFF_USER_AGENT: z
    .string()
    .min(12)
    .default("KierratysAppi/0.1 (contact: app-owner@example.invalid)"),
  WEB_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:8081")
    .transform((value, context) => {
      const origins = value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
      for (const origin of origins) {
        try {
          const parsed = new URL(origin);
          if (!new Set(["http:", "https:"]).has(parsed.protocol) || parsed.origin !== origin) {
            throw new Error("Origin must not contain a path");
          }
        } catch {
          context.addIssue({ code: "custom", message: `Invalid web origin: ${origin}` });
          return z.NEVER;
        }
      }
      return origins;
    }),
});

export type ApiEnvironment = z.infer<typeof ApiEnvironmentSchema>;

export function parseEnvironment(environment: NodeJS.ProcessEnv): ApiEnvironment {
  const parsed = ApiEnvironmentSchema.parse(environment);
  if (
    parsed.NODE_ENV === "production" &&
    (/(?:@|\.)example\.(?:com|net|org)|\.invalid/u.test(parsed.OFF_USER_AGENT) ||
      !/^[^/\s]+\/[^\s]+ \((?:contact:\s*)?[^@()\s]+@[^@()\s]+\.[^@()\s]+\)$/u.test(
        parsed.OFF_USER_AGENT,
      ))
  ) {
    throw new Error(
      "OFF_USER_AGENT must use AppName/Version (monitored-email) format in production",
    );
  }
  if (
    parsed.NODE_ENV === "production" &&
    parsed.WEB_ALLOWED_ORIGINS.some((origin) => new URL(origin).hostname === "localhost")
  ) {
    throw new Error("WEB_ALLOWED_ORIGINS must not contain localhost in production");
  }
  return parsed;
}
