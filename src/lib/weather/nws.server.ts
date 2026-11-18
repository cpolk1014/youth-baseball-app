import { zonedToUtc } from "@/lib/practice/ics";
import { forecastFor, parseAlerts, parseHourly, type WeatherResult } from "./forecast";

/**
 * The National Weather Service API (api.weather.gov): free, no key, US only. It asks for a
 * User-Agent naming the app. Answers are cached by Next: where a point's forecast lives for
 * a week, the hourly forecast for 30 minutes (the service itself refreshes about hourly),
 * alerts for 5 minutes.
 */
const BASE = "https://api.weather.gov";
const HEADERS = {
  "User-Agent": "RallyCap (rallycap.team)",
  Accept: "application/geo+json",
};

async function get(url: string, revalidate: number): Promise<unknown | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        next: { revalidate },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return await res.json();
      // Outside the US, or the point isn't covered: no use asking again.
      if (res.status === 404 || res.status === 400) return null;
    } catch {
      // Timeout or network: try once more.
    }
  }
  return null;
}

/** Four decimals (about 10 m) is what the service takes. */
const round = (n: number) => Math.round(n * 10_000) / 10_000;

export async function gameWeather(opts: {
  lat: number;
  lng: number;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, where it's played
  hours: number;
  now?: Date;
}): Promise<WeatherResult> {
  const point = `${round(opts.lat)},${round(opts.lng)}`;
  const points = (await get(`${BASE}/points/${point}`, 7 * 86_400)) as {
    properties?: { forecastHourly?: unknown; timeZone?: unknown };
  } | null;
  const hourlyUrl = points?.properties?.forecastHourly;
  const timeZone = points?.properties?.timeZone;
  if (
    typeof hourlyUrl !== "string" ||
    !hourlyUrl.startsWith(BASE) ||
    typeof timeZone !== "string"
  ) {
    return { status: "unavailable" };
  }
  const [hourly, alerts] = await Promise.all([
    get(hourlyUrl, 1800),
    get(`${BASE}/alerts/active?point=${point}`, 300),
  ]);
  if (!hourly) return { status: "unavailable" };
  const start = zonedToUtc(opts.date, opts.time ?? "12:00", timeZone);
  return forecastFor(
    parseHourly(hourly),
    parseAlerts(alerts),
    start,
    opts.date,
    opts.now ?? new Date(),
    opts.hours,
  );
}
