import { describe, expect, it, vi } from "vitest";

const openURL = vi.hoisted(() => vi.fn(async (_url: string) => undefined));
vi.mock("react-native", () => ({ Linking: { openURL } }));

import { openExternalUrl } from "./external-links";

describe("platform link boundary", () => {
  it("does not invoke the OS for a native intent, file or unsafe authority", async () => {
    for (const value of [
      "file:///private",
      "intent://settings",
      "javascript:alert(1)",
      "https://user@www.hsy.fi",
      "https://127.0.0.1",
      "https://attacker.example/phishing",
      "https://www.hsy.fi.attacker.example/",
    ])
      await expect(openExternalUrl(value)).rejects.toThrow("unsafe_external_link");
    expect(openURL).not.toHaveBeenCalled();
  });
  it("opens an actual HTTPS source using the platform browser", async () => {
    await openExternalUrl("https://www.hsy.fi/jatteet/");
    expect(openURL).toHaveBeenCalledWith("https://www.hsy.fi/jatteet/");
  });
});
