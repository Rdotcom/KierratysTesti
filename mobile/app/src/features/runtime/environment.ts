/** Native host identity, never the mutable app manifest or a build-number guess. */
export function isExpoGoEnvironment(
  executionEnvironment: unknown,
  nativeExpoGoHost: unknown = false,
): boolean {
  return nativeExpoGoHost === true || executionEnvironment === "storeClient";
}
