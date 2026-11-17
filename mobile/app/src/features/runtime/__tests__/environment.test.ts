import { describe, expect, it } from "vitest";
import { isExpoGoEnvironment } from "../environment";

describe("Expo Go host detection", () => {
  it.each(["bare", "standalone", undefined, null, "unknown", "expo", {}, { appOwnership: "expo" }])(
    "does not guess Expo Go from %j",
    (value) => {
      expect(isExpoGoEnvironment(value)).toBe(false);
    },
  );
  it("recognizes only the native storeClient execution environment", () => {
    expect(isExpoGoEnvironment("storeClient")).toBe(true);
  });
  it("accepts Expo's native ExpoGo-module probe even when constants omit the environment", () => {
    expect(isExpoGoEnvironment(undefined, true)).toBe(true);
    expect(isExpoGoEnvironment("bare", true)).toBe(true);
    expect(isExpoGoEnvironment(undefined, "true")).toBe(false);
  });
});
