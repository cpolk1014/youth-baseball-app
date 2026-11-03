import { describe, expect, it } from "vitest";
import { detectPlatform, isPhoneOrTablet, openInLinks, type GamePlace } from "./maps";

const place: GamePlace = {
  name: "Traction Sports Complex",
  address: "100 Main St, Broussard, LA",
  lat: 30.15,
  lng: -91.96,
  placeId: "ChIJabc",
};
const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36",
};
const apps = (ua: string, touch = 0) => {
  const platform = detectPlatform(ua, touch);
  return openInLinks(place, platform, isPhoneOrTablet(platform, ua)).map((l) => l.app);
};

describe("Open in… by device", () => {
  it("offers each phone its own maps app, plus Waze", () => {
    expect(apps(UA.iphone)).toEqual(["Apple Maps", "Waze"]);
    expect(apps(UA.ipad, 5)).toEqual(["Apple Maps", "Waze"]);
    expect(apps(UA.android)).toEqual(["Google Maps", "Waze"]);
  });

  it("offers computers Google Maps, or Bing on Windows, and no Waze", () => {
    expect(apps(UA.windows)).toEqual(["Bing Maps"]);
    expect(apps(UA.mac)).toEqual(["Google Maps"]);
  });

  it("builds links to the exact spot", () => {
    const links = Object.fromEntries(openInLinks(place, "ios", true).map((l) => [l.app, l.href]));
    expect(links["Apple Maps"]).toBe(
      "https://maps.apple.com/?q=Traction%20Sports%20Complex&ll=30.15,-91.96",
    );
    expect(links["Waze"]).toBe("https://waze.com/ul?ll=30.15,-91.96&navigate=yes");
    const google = openInLinks(place, "android", true)[0]!.href;
    expect(google).toContain("query=Traction%20Sports%20Complex%2C%20100%20Main%20St");
    expect(google).toContain("query_place_id=ChIJabc");
    expect(openInLinks(place, "windows", false)[0]!.href).toContain("cp=30.15~-91.96");
  });

  it("falls back to the name and address without a map position", () => {
    const typed = { ...place, lat: null, lng: null, placeId: null };
    expect(openInLinks(typed, "ios", true)[1]!.href).toBe(
      "https://waze.com/ul?q=Traction%20Sports%20Complex%2C%20100%20Main%20St%2C%20Broussard%2C%20LA&navigate=yes",
    );
  });
});
