// Opening a game's place in a maps app: which apps to offer on this device, and their links.

export interface GamePlace {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
}

export type Platform = "ios" | "android" | "windows" | "other";

/** The device, from its browser. iPads report a Mac browser but have a touch screen. */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  if (/Windows/i.test(userAgent)) return "windows";
  return "other";
}

export function isPhoneOrTablet(platform: Platform, userAgent: string): boolean {
  return platform === "ios" || platform === "android" || /Mobi|Windows Phone/i.test(userAgent);
}

const query = (p: GamePlace) => [p.name, p.address].filter(Boolean).join(", ");
const hasSpot = (p: GamePlace) => p.lat !== null && p.lng !== null;

export function appleMapsUrl(p: GamePlace): string {
  const q = `q=${encodeURIComponent(p.name)}`;
  return hasSpot(p)
    ? `https://maps.apple.com/?${q}&ll=${p.lat},${p.lng}`
    : `https://maps.apple.com/?${q}${p.address ? `&address=${encodeURIComponent(p.address)}` : ""}`;
}

export function googleMapsUrl(p: GamePlace): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query(p))}${
    p.placeId ? `&query_place_id=${encodeURIComponent(p.placeId)}` : ""
  }`;
}

export function bingMapsUrl(p: GamePlace): string {
  return `https://www.bing.com/maps?${hasSpot(p) ? `cp=${p.lat}~${p.lng}&lvl=16&` : ""}where1=${encodeURIComponent(query(p))}`;
}

export function wazeUrl(p: GamePlace): string {
  return hasSpot(p)
    ? `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(query(p))}&navigate=yes`;
}

/**
 * The "Open in…" buttons for this device: Apple Maps on iPhone/iPad, Google Maps on Android
 * (and on computers other than Windows), Bing Maps on Windows, and Waze on any phone or tablet.
 */
export function openInLinks(
  p: GamePlace,
  platform: Platform,
  mobile: boolean,
): { app: string; href: string }[] {
  const links: { app: string; href: string }[] = [];
  if (platform === "ios") links.push({ app: "Apple Maps", href: appleMapsUrl(p) });
  if (platform === "android" || platform === "other")
    links.push({ app: "Google Maps", href: googleMapsUrl(p) });
  if (platform === "windows") links.push({ app: "Bing Maps", href: bingMapsUrl(p) });
  if (mobile) links.push({ app: "Waze", href: wazeUrl(p) });
  return links;
}
