import { CoordinatesSchema, type Coordinates } from "@kierratysappi/domain";

export const NEARBY_GEOCODE_INPUT_MAX_LENGTH = 120;

export type NearbyGeocodeInputKind = "postal-code" | "address";
export type NearbyGeocodeFailure = "invalid-input" | "no-result" | "service-failure" | "cancelled";

export class NearbyGeocodeIssue extends Error {
  constructor(readonly reason: NearbyGeocodeFailure) {
    super(reason);
  }
}

export type NearbyGeocodeQuery = {
  readonly kind: NearbyGeocodeInputKind;
  readonly value: string;
  readonly params: URLSearchParams;
};

export type NearbyGeocodeResult = {
  readonly kind: NearbyGeocodeInputKind;
  readonly coordinates: Coordinates;
};

type NominatimHit = { lat?: unknown; lon?: unknown };
type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export function prepareNearbyGeocodeQuery(rawInput: string): NearbyGeocodeQuery {
  const value = rawInput.trim();
  if (value.length === 0 || value.length > NEARBY_GEOCODE_INPUT_MAX_LENGTH)
    throw new NearbyGeocodeIssue("invalid-input");
  const kind: NearbyGeocodeInputKind = /^\d{5}$/.test(value) ? "postal-code" : "address";
  if (kind === "address" && !/[\p{L}\p{N}]/u.test(value))
    throw new NearbyGeocodeIssue("invalid-input");

  const params = new URLSearchParams({
    countrycodes: "fi",
    format: "jsonv2",
    limit: "1",
  });
  if (kind === "postal-code") params.set("postalcode", value);
  else params.set("q", value);
  return { kind, value, params };
}

export async function geocodeNearbyInput(
  rawInput: string,
  options: { signal: AbortSignal; fetcher?: Fetcher },
): Promise<NearbyGeocodeResult> {
  if (options.signal.aborted) throw new NearbyGeocodeIssue("cancelled");
  let query: NearbyGeocodeQuery;
  try {
    query = prepareNearbyGeocodeQuery(rawInput);
  } catch (error) {
    if (error instanceof NearbyGeocodeIssue) throw error;
    throw new NearbyGeocodeIssue("invalid-input");
  }

  const fetcher = options.fetcher ?? fetch;
  const endpoint = new URL("https://nominatim.openstreetmap.org/search");
  endpoint.search = query.params.toString();

  let response: Response;
  try {
    response = await fetcher(endpoint.toString(), {
      signal: options.signal,
      headers: {
        "Accept-Language": "fi-FI,fi",
      },
    });
  } catch (error) {
    if (options.signal.aborted) throw new NearbyGeocodeIssue("cancelled");
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    )
      throw new NearbyGeocodeIssue("cancelled");
    throw new NearbyGeocodeIssue("service-failure");
  }
  if (options.signal.aborted) throw new NearbyGeocodeIssue("cancelled");
  if (!response.ok) throw new NearbyGeocodeIssue("service-failure");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new NearbyGeocodeIssue("service-failure");
  }
  if (!Array.isArray(payload)) throw new NearbyGeocodeIssue("service-failure");
  if (payload.length === 0) throw new NearbyGeocodeIssue("no-result");

  const first = payload[0] as NominatimHit;
  const parsed = CoordinatesSchema.safeParse({
    latitude: Number(first.lat),
    longitude: Number(first.lon),
  });
  if (!parsed.success) throw new NearbyGeocodeIssue("service-failure");

  return { kind: query.kind, coordinates: parsed.data };
}
