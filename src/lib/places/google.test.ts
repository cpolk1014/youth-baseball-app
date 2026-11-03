import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlacesUnavailable, placeDetails, searchPlaces } from "./google";

const reply = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("Google Places", () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("turns suggestions into names and details", async () => {
    const s = await searchPlaces(
      "Traction",
      "tok",
      reply({
        suggestions: [
          {
            placePrediction: {
              placeId: "ChIJ1",
              structuredFormat: {
                mainText: { text: "Traction Sports Complex" },
                secondaryText: { text: "Broussard, LA, USA" },
              },
            },
          },
          { queryPrediction: { text: { text: "traction" } } },
        ],
      }),
    );
    expect(s).toEqual([
      { placeId: "ChIJ1", name: "Traction Sports Complex", detail: "Broussard, LA, USA" },
    ]);
  });

  it("reads the address and map position of a pick", async () => {
    const d = await placeDetails(
      "ChIJ1",
      "tok",
      reply({
        id: "ChIJ1",
        formattedAddress: "100 Main St, Broussard, LA 70518, USA",
        location: { latitude: 30.15, longitude: -91.96 },
      }),
    );
    expect(d).toEqual({
      placeId: "ChIJ1",
      address: "100 Main St, Broussard, LA 70518, USA",
      lat: 30.15,
      lng: -91.96,
    });
  });

  it("says when it isn't set up or Google refuses", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    await expect(searchPlaces("x", "t", reply({}))).rejects.toBeInstanceOf(PlacesUnavailable);
    process.env.GOOGLE_MAPS_API_KEY = "k";
    await expect(searchPlaces("x", "t", reply({}, 403))).rejects.toThrow(/failed \(403\)/);
  });
});
