/**
 * Game-time weather from the US National Weather Service (api.weather.gov), pure: parsing
 * its hourly forecast and alerts, and turning the hours of a game into a short summary with
 * flags worth a coach's attention (storms, rain, heat, cold, wind). No I/O here.
 */

export interface Hour {
  /** ISO start of the hour, with the place's offset. */
  start: string;
  temp: number; // °F
  /** Chance of rain, 0–100. */
  rain: number;
  humidity: number | null;
  wind: number; // mph
  windDir: string;
  short: string; // "Chance Showers And Thunderstorms"
  day: boolean;
}

export interface Alert {
  event: string; // "Severe Thunderstorm Warning"
  headline: string;
  severity: string; // Extreme | Severe | Moderate | Minor | Unknown
  ends: string | null; // ISO
}

export type FlagKind = "storm" | "rain" | "heat" | "cold" | "wind";

export interface Flag {
  kind: FlagKind;
  text: string;
}

export interface GameWeather {
  status: "ok";
  /** At first pitch. */
  temp: number;
  short: string;
  emoji: string;
  /** Over the game's hours. */
  rain: number;
  wind: number;
  windDir: string;
  high: number;
  low: number;
  /** Highest heat index over the game's hours, when it's above the temperature. */
  feelsLike: number | null;
  flags: Flag[];
  alerts: Alert[];
  /** When the National Weather Service last updated this forecast. */
  updated: string | null;
}

/** Before the forecast reaches the game ("Forecast shows up Fri, Nov 20"). */
export interface WeatherLater {
  status: "later";
  /** YYYY-MM-DD from which the forecast covers the game. */
  from: string;
}

export interface WeatherUnavailable {
  status: "unavailable";
}

export type WeatherResult = GameWeather | WeatherLater | WeatherUnavailable;

/** How many days ahead the hourly forecast reaches (156 hours, so call it 6). */
export const FORECAST_DAYS = 6;
/** Hours of weather a game covers when we don't know how long it runs. */
export const GAME_HOURS = 2;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const unitValue = (v: unknown): number | null =>
  v && typeof v === "object" ? num((v as { value?: unknown }).value) : num(v);

/** "10 mph" or "10 to 15 mph" → the higher number. */
export function windMph(text: unknown): number {
  if (typeof text !== "string") return 0;
  const all = text.match(/\d+/g)?.map(Number) ?? [];
  return all.length ? Math.max(...all) : 0;
}

/** The periods of an hourly forecast response, skipping anything malformed. */
export function parseHourly(json: unknown): { hours: Hour[]; updated: string | null } {
  const props = (json as { properties?: Record<string, unknown> } | null)?.properties ?? {};
  const periods = Array.isArray(props.periods) ? props.periods : [];
  const hours: Hour[] = [];
  for (const raw of periods as Record<string, unknown>[]) {
    const temp = num(raw?.temperature);
    if (typeof raw?.startTime !== "string" || temp === null) continue;
    const celsius = raw.temperatureUnit === "C";
    hours.push({
      start: raw.startTime,
      temp: celsius ? Math.round((temp * 9) / 5 + 32) : temp,
      rain: unitValue(raw.probabilityOfPrecipitation) ?? 0,
      humidity: unitValue(raw.relativeHumidity),
      wind: windMph(raw.windSpeed),
      windDir: typeof raw.windDirection === "string" ? raw.windDirection : "",
      short: typeof raw.shortForecast === "string" ? raw.shortForecast : "",
      day: raw.isDaytime !== false,
    });
  }
  const updated = typeof props.updateTime === "string" ? props.updateTime : null;
  return { hours, updated };
}

/** Active alerts for a point, newest first as the weather service lists them. */
export function parseAlerts(json: unknown): Alert[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: Alert[] = [];
  for (const f of features as { properties?: Record<string, unknown> }[]) {
    const p = f?.properties;
    if (!p || typeof p.event !== "string") continue;
    // Tests and drills aren't real alerts.
    if (p.status && p.status !== "Actual") continue;
    const ends =
      typeof p.ends === "string" ? p.ends : typeof p.expires === "string" ? p.expires : null;
    out.push({
      event: p.event,
      headline: typeof p.headline === "string" ? p.headline : p.event,
      severity: typeof p.severity === "string" ? p.severity : "Unknown",
      ends,
    });
  }
  return out;
}

/**
 * The National Weather Service heat index (°F) from temperature and humidity: the Rothfusz
 * formula with its adjustments, or the simple one below 80°.
 */
export function heatIndex(tempF: number, humidity: number): number {
  const T = tempF;
  const R = humidity;
  const simple = 0.5 * (T + 61 + (T - 68) * 1.2 + R * 0.094);
  if ((simple + T) / 2 < 80) return Math.round(simple);
  let hi =
    -42.379 +
    2.04901523 * T +
    10.14333127 * R -
    0.22475541 * T * R -
    0.00683783 * T * T -
    0.05481717 * R * R +
    0.00122874 * T * T * R +
    0.00085282 * T * R * R -
    0.00000199 * T * T * R * R;
  if (R < 13 && T >= 80 && T <= 112) hi -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  else if (R > 85 && T >= 80 && T <= 87) hi += ((R - 85) / 10) * ((87 - T) / 5);
  return Math.round(hi);
}

/** An emoji for a forecast's words. */
export function weatherEmoji(short: string, day = true): string {
  const s = short.toLowerCase();
  if (s.includes("thunder")) return "⛈️";
  if (s.includes("snow") || s.includes("sleet") || s.includes("flurr")) return "🌨️";
  if (s.includes("rain") || s.includes("shower") || s.includes("drizzle")) return "🌧️";
  if (s.includes("fog") || s.includes("haze") || s.includes("smoke")) return "🌫️";
  if (s.includes("partly") || (s.includes("mostly") && s.includes("sunny")))
    return day ? "⛅" : "☁️";
  if (s.includes("mostly clear")) return day ? "🌤️" : "🌙";
  if (s.includes("cloud") || s.includes("overcast")) return "☁️";
  if (s.includes("wind") || s.includes("breez")) return "💨";
  return day ? "☀️" : "🌙";
}

/** The hours from first pitch through `hours` later (the hour first pitch falls in, included). */
export function hoursFor(all: Hour[], start: Date, hours = GAME_HOURS): Hour[] {
  const from = start.getTime();
  const to = from + hours * 3_600_000;
  return all.filter((h) => {
    const s = Date.parse(h.start);
    return s + 3_600_000 > from && s < to;
  });
}

/** Flags for a game's hours, most serious first. */
export function weatherFlags(hours: Hour[]): Flag[] {
  if (hours.length === 0) return [];
  const flags: Flag[] = [];
  const rain = Math.max(...hours.map((h) => h.rain));
  const thunder = hours.some((h) => /thunder/i.test(h.short));
  if (thunder) {
    flags.push({
      kind: "storm",
      text:
        rain >= 50
          ? `Thunderstorms likely around game time (${rain}%)`
          : "Thunderstorms possible around game time",
    });
  } else if (rain >= 50) {
    flags.push({ kind: "rain", text: `Rain likely around game time (${rain}%)` });
  }
  const feels = Math.max(
    ...hours.map((h) =>
      h.humidity === null ? h.temp : Math.max(h.temp, heatIndex(h.temp, h.humidity)),
    ),
  );
  if (feels >= 103) {
    flags.push({
      kind: "heat",
      text: `Dangerous heat: feels like ${feels}°. Extra water, shade and breaks`,
    });
  } else if (feels >= 95) {
    flags.push({ kind: "heat", text: `Hot: feels like ${feels}°. Bring extra water` });
  }
  const low = Math.min(...hours.map((h) => h.temp));
  if (low <= 45) flags.push({ kind: "cold", text: `Cold: ${low}°. Dress in layers` });
  const wind = Math.max(...hours.map((h) => h.wind));
  if (wind >= 20) flags.push({ kind: "wind", text: `Windy: up to ${wind} mph` });
  return flags;
}

/** The game's weather from its hours, or null when the forecast doesn't reach it. */
export function summarize(
  hours: Hour[],
  alerts: Alert[],
  updated: string | null,
): GameWeather | null {
  if (hours.length === 0) return null;
  const first = hours[0]!;
  const windiest = hours.reduce((a, b) => (b.wind > a.wind ? b : a));
  const temps = hours.map((h) => h.temp);
  const feels = Math.max(
    ...hours.map((h) => (h.humidity === null ? h.temp : heatIndex(h.temp, h.humidity))),
  );
  return {
    status: "ok",
    temp: first.temp,
    short: first.short,
    emoji: weatherEmoji(first.short, first.day),
    rain: Math.max(...hours.map((h) => h.rain)),
    wind: windiest.wind,
    windDir: windiest.windDir,
    high: Math.max(...temps),
    low: Math.min(...temps),
    feelsLike: feels >= first.temp + 3 && feels >= 80 ? feels : null,
    flags: weatherFlags(hours),
    alerts,
    updated,
  };
}

/** One line for small places: "☀️ 72° · 10% rain". */
export function weatherLine(w: GameWeather): string {
  return `${w.emoji} ${w.temp}°${w.rain >= 10 ? ` · ${w.rain}% rain` : ""}`;
}

function minusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Alerts are about now, so they show only for games starting within this many hours. */
export const ALERT_HOURS = 12;

/**
 * The weather for a game starting at `start` (on `gameDate`, YYYY-MM-DD where it's played):
 * the summary, "later" when the forecast doesn't reach it yet, or unavailable.
 */
export function forecastFor(
  hourly: { hours: Hour[]; updated: string | null },
  alerts: Alert[],
  start: Date,
  gameDate: string,
  now: Date,
  hours = GAME_HOURS,
): WeatherResult {
  const all = hourly.hours;
  if (all.length === 0) return { status: "unavailable" };
  const last = Date.parse(all[all.length - 1]!.start) + 3_600_000;
  if (start.getTime() >= last) return { status: "later", from: minusDays(gameDate, FORECAST_DAYS) };
  const soon = start.getTime() - now.getTime() < ALERT_HOURS * 3_600_000;
  const w = summarize(hoursFor(all, start, hours), soon ? alerts : [], hourly.updated);
  return w ?? { status: "unavailable" };
}
