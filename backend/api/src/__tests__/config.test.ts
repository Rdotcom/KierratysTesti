import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../config";

describe("API environment", () => {
  it("uses loopback-safe local defaults", () => {
    expect(parseEnvironment({ NODE_ENV: "test" })).toMatchObject({
      HOST: "127.0.0.1",
      PORT: 3000,
      NODE_ENV: "test",
    });
  });

  it("requires an identified Open Food Facts contact in production", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        WEB_ALLOWED_ORIGINS: "https://app.example.com",
      }),
    ).toThrow("OFF_USER_AGENT");
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        OFF_USER_AGENT: "KierratysAppi/1.0 (unmonitored-contact)",
        WEB_ALLOWED_ORIGINS: "https://app.example.com",
      }),
    ).toThrow("monitored-email");
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        OFF_USER_AGENT: "KierratysAppi/1.0 (contact: ops@example.com)",
        WEB_ALLOWED_ORIGINS: "https://app.example.com",
      }),
    ).toThrow("monitored-email");
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        OFF_USER_AGENT: "KierratysAppi/1.0 (contact: ops@kierratysappi.fi)",
      }),
    ).toThrow("WEB_ALLOWED_ORIGINS");
    expect(
      parseEnvironment({
        NODE_ENV: "production",
        OFF_USER_AGENT: "KierratysAppi/1.0 (contact: ops@kierratysappi.fi)",
        WEB_ALLOWED_ORIGINS: "https://app.example.com",
      }).OFF_USER_AGENT,
    ).toContain("ops@kierratysappi.fi");
  });

  it("accepts only exact HTTP origins", () => {
    expect(
      parseEnvironment({
        NODE_ENV: "test",
        WEB_ALLOWED_ORIGINS: "http://localhost:8081,https://preview.example.com",
      }).WEB_ALLOWED_ORIGINS,
    ).toEqual(["http://localhost:8081", "https://preview.example.com"]);
    expect(() =>
      parseEnvironment({
        NODE_ENV: "test",
        WEB_ALLOWED_ORIGINS: "javascript:alert(1)",
      }),
    ).toThrow("Invalid web origin");
  });
  it.each(["http://app.example.test", "https://127.0.0.1", "https://sub.localhost"])(
    "rejects insecure production origin %s",
    (origin) => {
      expect(() =>
        parseEnvironment({
          NODE_ENV: "production",
          OFF_USER_AGENT: "KierratysAppi/1.0 (contact: ops@kierratysappi.fi)",
          WEB_ALLOWED_ORIGINS: origin,
        }),
      ).toThrow("HTTPS public hostnames");
    },
  );
});
