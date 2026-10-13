export type NearbyEstimate =
  | { source: "device"; accuracyMeters: number | null }
  | { source: "geocoded"; inputKind: "postal-code" | "address" };

export function nearbyEstimateMessageKey(estimate: NearbyEstimate) {
  return estimate.source === "device" ? "nearbyDeviceEstimate" : "nearbyGeocodedEstimate";
}

export function isApproximateDeviceEstimate(estimate: NearbyEstimate) {
  return (
    estimate.source === "device" &&
    estimate.accuracyMeters !== null &&
    Number.isFinite(estimate.accuracyMeters) &&
    estimate.accuracyMeters > 100
  );
}
