import { z } from "zod";

/** A web link, never a native intent, local file, credential-bearing URL or IP.
 * This is scheme/authority validation, not a DNS/SSRF guarantee or endorsement. */
export function safeWebUrl(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !/^https:\/\//iu.test(value) ||
    /[\s\\\p{Cc}\p{Cf}]/u.test(value)
  )
    return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/\.$/u, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !host.includes(".") ||
      host.includes(":") ||
      /^(?:\d+\.)*\d+$/u.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|lan)$/iu.test(host)
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export const WebUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => safeWebUrl(value) !== undefined, "safe_https_web_url");

/** HTTP is solely for explicit loopback/private-IP development, never the public Internet. */
export function isLocalDevelopmentHost(host: string): boolean {
  if (host === "localhost" || host === "[::1]") return true;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) return false;
  const parts = host.split(".").map(Number);
  if (parts.some((part) => part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 127 ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31)
  );
}
