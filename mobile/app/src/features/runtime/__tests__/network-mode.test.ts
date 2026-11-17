import { expect, it } from "vitest";
import { usesNetworkRecognition } from "../network-mode";
it("uses browser/Go network mode without replacing installed native offline inference", () => {
  expect(usesNetworkRecognition("web", false)).toBe(true);
  for (const platform of ["ios", "android"]) {
    expect(usesNetworkRecognition(platform, true)).toBe(true);
    expect(usesNetworkRecognition(platform, false)).toBe(false);
  }
});
