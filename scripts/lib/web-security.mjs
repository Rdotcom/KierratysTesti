import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function webSecurityHeaders(directory, environment = {}) {
  const root = fs.realpathSync(directory),
    hashes = new Set();
  let count = 0;
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (++count > 2000 || entry.isSymbolicLink()) throw Error("untrusted_web_export");
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith(".html")) {
        if (fs.statSync(file).size > 2_000_000) throw Error("html_bound");
        const html = fs.readFileSync(file, "utf8");
        for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script(?:\s+[^>]*)?>/giu)) {
          if (!/\bsrc\s*=/iu.test(match[1]))
            hashes.add(`'sha256-${createHash("sha256").update(match[2]).digest("base64")}'`);
        }
      }
    }
  }
  visit(root);
  if (hashes.size > 128) throw Error("script_hash_bound");
  const connections = new Set(["'self'", "https://world.openfoodfacts.org"]);
  for (const name of ["EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_SIGLIP_BASE_URL"]) {
    const value = environment[name];
    if (!value) continue;
    const url = new URL(value);
    const local =
      /^(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/u.test(
        url.hostname,
      );
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" &&
        !(environment.EXPO_PUBLIC_APP_ENV === "development" && url.protocol === "http:" && local))
    )
      throw Error("unsafe_web_connection_origin");
    connections.add(url.origin);
  }
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' ${[...hashes].join(" ")}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://images.openfoodfacts.org https://static.openfoodfacts.org",
      "font-src 'self' data:",
      `connect-src ${[...connections].join(" ")}`,
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy":
      "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), serial=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000",
  };
}
