import { describe, expect, it } from "vitest";
import { isLocalDevelopmentHost, safeWebUrl, WebUrlSchema } from "../web-url";

describe("untrusted external web links", () => {
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "content://contacts/1",
    "intent://scan/#Intent;scheme=x;end",
    "data:text/html,<script>x</script>",
    "http://www.hsy.fi/",
    "https://user:password@www.hsy.fi/",
    "https://www.hsy.fi:8443/",
    "https://127.0.0.1/",
    "https://0x7f000001/",
    "https://2130706433/",
    "https://[::1]/",
    "https://localhost/",
    "https://localhost./",
    "https://router.local/",
    "https://www.hsy.fi\\@evil.test/",
    "https://www.hsy.fi/\n",
    "https://example.test/\u202e",
    "https://example.test/" + "x".repeat(2048),
  ])("rejects unsafe link %s", (url) => {
    expect(safeWebUrl(url)).toBeUndefined();
    expect(WebUrlSchema.safeParse(url).success).toBe(false);
  });
  it("allows canonical credential-free HTTPS and retains useful fragments", () => {
    expect(safeWebUrl("https://www.hsy.fi/jatteet/#lajittelu")).toBe(
      "https://www.hsy.fi/jatteet/#lajittelu",
    );
    expect(safeWebUrl("https://world.openfoodfacts.org/product/3017620422003")).toBeDefined();
    expect(safeWebUrl(null)).toBeUndefined();
    expect(safeWebUrl("https://kierratysappi.local/object-selection")).toBeUndefined();
  });
  it("limits cleartext development to loopback/private addresses, not attacker DNS", () => {
    for (const host of [
      "localhost",
      "[::1]",
      "127.0.0.1",
      "10.0.2.2",
      "192.168.1.2",
      "172.16.0.1",
      "172.31.255.255",
    ])
      expect(isLocalDevelopmentHost(host)).toBe(true);
    for (const host of [
      "attacker.example",
      "localhost.attacker.test",
      "169.254.169.254",
      "192.168.1.300",
      "172.15.0.1",
      "172.32.0.1",
      "0.0.0.0",
      "8.8.8.8",
    ])
      expect(isLocalDevelopmentHost(host)).toBe(false);
  });
});
