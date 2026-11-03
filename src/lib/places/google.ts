// Google Places (New), server-side only (GOOGLE_MAPS_API_KEY, restricted to the Places API).
// Typing shows suggestions; picking one looks up its address and map position. Both share a
// session token, so Google bills a pick, not every keystroke.

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  /** "Broussard, LA, USA" */
  detail: string;
}

export interface PlaceDetails {
  placeId: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

const BASE = "https://places.googleapis.com/v1";

function key(): string {
  const k = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!k)
    throw new PlacesUnavailable("Place search isn't set up yet (missing GOOGLE_MAPS_API_KEY).");
  return k;
}

export class PlacesUnavailable extends Error {}

export async function searchPlaces(
  input: string,
  sessionToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceSuggestion[]> {
  const res = await fetchImpl(`${BASE}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key() },
    body: JSON.stringify({ input, sessionToken, includedRegionCodes: ["us"] }),
  });
  if (!res.ok) throw new PlacesUnavailable(`Place search failed (${res.status}).`);
  const json = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      };
    }[];
  };
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .map((p) => ({
      placeId: p.placeId!,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      detail: p.structuredFormat?.secondaryText?.text ?? "",
    }))
    .filter((p) => p.name)
    .slice(0, 6);
}

export async function placeDetails(
  placeId: string,
  sessionToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceDetails> {
  const res = await fetchImpl(
    `${BASE}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
    // Address and position only (the cheapest details; the name comes from the suggestion).
    { headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "id,formattedAddress,location" } },
  );
  if (!res.ok) throw new PlacesUnavailable(`Place lookup failed (${res.status}).`);
  const p = (await res.json()) as {
    id?: string;
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  };
  return {
    placeId: p.id ?? placeId,
    address: p.formattedAddress ?? null,
    lat: typeof p.location?.latitude === "number" ? p.location.latitude : null,
    lng: typeof p.location?.longitude === "number" ? p.location.longitude : null,
  };
}
