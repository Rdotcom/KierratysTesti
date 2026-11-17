/** Explicit browser origins only. This is CORS configuration, not public-server authorization. */
export function parseSiglipWebOrigins(value: string | undefined): string[] {
  const input = value ?? "http://localhost:8097,http://127.0.0.1:8097";
  if (input.length > 2048) throw Error("invalid_siglip_web_origins");
  const values = input.split(",").map((item) => item.trim());
  if (values.length > 8) throw Error("invalid_siglip_web_origins");
  return [
    ...new Set(
      values.map((item) => {
        const url = new URL(item);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash ||
          url.hostname.includes("*")
        )
          throw Error("invalid_siglip_web_origins");
        return url.origin;
      }),
    ),
  ];
}
