import { describe, expect, it } from "vitest";
import { isApproximateDeviceEstimate, nearbyEstimateMessageKey } from "../nearby-estimate";

describe("nearby estimate presentation", () => {
  it("keeps device and geocoded estimate messaging distinct", () => {
    expect(nearbyEstimateMessageKey({ source: "device", accuracyMeters: 30 })).toBe(
      "nearbyDeviceEstimate",
    );
    expect(nearbyEstimateMessageKey({ source: "geocoded", inputKind: "postal-code" })).toBe(
      "nearbyGeocodedEstimate",
    );
  });

  it("marks only coarse device readings as approximate", () => {
    expect(isApproximateDeviceEstimate({ source: "device", accuracyMeters: 50 })).toBe(false);
    expect(isApproximateDeviceEstimate({ source: "device", accuracyMeters: 180 })).toBe(true);
    expect(isApproximateDeviceEstimate({ source: "geocoded", inputKind: "address" })).toBe(false);
  });
});
