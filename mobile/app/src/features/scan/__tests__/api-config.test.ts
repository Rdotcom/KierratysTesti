import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl } from "../api-config";

describe("mobile API configuration", () => {
  it("does not default a missing environment to insecure development", () => {
    expect(() =>
      resolveApiBaseUrl({ platform: "ios", appEnvironment: undefined, configuredUrl: undefined }),
    ).toThrow();
    expect(() =>
      resolveApiBaseUrl({
        platform: "ios",
        appEnvironment: "development",
        configuredUrl: "http://attacker.example",
      }),
    ).toThrow("private IP");
    expect(
      resolveApiBaseUrl({
        platform: "ios",
        appEnvironment: "development",
        configuredUrl: "http://192.168.1.2:3000",
      }),
    ).toBe("http://192.168.1.2:3000");
  });
  it("uses emulator loopback only in development", () => {
    expect(
      resolveApiBaseUrl({
        platform: "android",
        appEnvironment: "development",
        configuredUrl: undefined,
      }),
    ).toBe("http://10.0.2.2:3000");
  });

  it("requires an explicit HTTPS origin for preview and production", () => {
    expect(() =>
      resolveApiBaseUrl({
        platform: "ios",
        appEnvironment: "production",
        configuredUrl: undefined,
      }),
    ).toThrow("required outside development");
    expect(() =>
      resolveApiBaseUrl({
        platform: "ios",
        appEnvironment: "preview",
        configuredUrl: "http://api.example.test",
      }),
    ).toThrow("must use HTTPS outside development");
    expect(
      resolveApiBaseUrl({
        platform: "ios",
        appEnvironment: "production",
        configuredUrl: "https://api.example.test/",
      }),
    ).toBe("https://api.example.test");
  });

  it("rejects credentials, paths, query strings, and non-HTTP schemes", () => {
    for (const configuredUrl of [
      "https://user:secret@example.test",
      "https://example.test/v1",
      "https://example.test?debug=true",
      "file:///tmp/socket",
    ]) {
      expect(() =>
        resolveApiBaseUrl({
          platform: "web",
          appEnvironment: "production",
          configuredUrl,
        }),
      ).toThrow();
    }
  });
});
