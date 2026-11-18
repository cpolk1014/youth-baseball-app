"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@/lib/data/game";
import { weatherLine, type GameWeather, type WeatherResult } from "@/lib/weather/forecast";

/** The last forecasts seen, kept on the device so the dugout sees one with no signal. */
export const WEATHER_KEY = "rallycap:weather";
const KEEP = 20;
/** Ask again after this long. */
const FRESH_MS = 15 * 60_000;

/** Older than this, the card says "Forecast as of…". */
const STALE_MS = 3 * 3_600_000;

interface Shown {
  w: WeatherResult | null;
  at: number | null;
  stale: boolean;
}

type Saved = Record<string, { at: number; w: WeatherResult }>;

function readSaved(): Saved {
  try {
    return JSON.parse(window.localStorage.getItem(WEATHER_KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
}

function save(key: string, w: WeatherResult) {
  try {
    const all = readSaved();
    all[key] = { at: Date.now(), w };
    const newest = Object.entries(all)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, KEEP);
    window.localStorage.setItem(WEATHER_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch {
    // Storage full or blocked: just don't keep it.
  }
}

function localIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** How many days the "Forecast shows up…" note looks ahead. */
const SHOW_LATER_DAYS = 14;

export interface WeatherPlace {
  locationLat?: number | null;
  locationLng?: number | null;
}

/**
 * A game's (or practice's) forecast for the hours it's played, fetched from /api/weather.
 * Nothing for past events, places without a map pin, or outside the US.
 */
export function useWeather(
  place: WeatherPlace,
  date: string,
  time: string | null,
  hours = 2,
): Shown {
  const lat = place.locationLat ?? null;
  const lng = place.locationLng ?? null;
  const [state, setState] = useState<Shown>({ w: null, at: null, stale: false });

  useEffect(() => {
    if (lat === null || lng === null) return;
    const today = localIso();
    const limit = new Date();
    limit.setDate(limit.getDate() + SHOW_LATER_DAYS);
    if (date < today || date > localIso(limit)) return;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)},${date},${time ?? ""},${hours}`;
    const saved = readSaved()[key];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the copy on this device first
    if (saved) setState({ w: saved.w, at: saved.at, stale: Date.now() - saved.at > STALE_MS });
    if (saved && Date.now() - saved.at < FRESH_MS) return;
    let live = true;
    const q = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      date,
      hours: String(hours),
    });
    if (time) q.set("time", time.slice(0, 5));
    fetch(`/api/weather?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<WeatherResult>) : null))
      .then((w) => {
        if (!live || !w) return;
        save(key, w);
        setState({ w, at: Date.now(), stale: false });
      })
      .catch(() => {
        // Offline: keep what the device has.
      });
    return () => {
      live = false;
    };
  }, [lat, lng, date, time, hours]);

  return state;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function asOf(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return localIso(d) === localIso() ? time : `${shortDate(localIso(d))}, ${time}`;
}

const FLAG_CLASS = {
  storm: "border-amber-500 bg-amber-50 text-amber-950",
  rain: "border-sky-500 bg-sky-50 text-sky-950",
  heat: "border-orange-500 bg-orange-50 text-orange-950",
  cold: "border-sky-500 bg-sky-50 text-sky-950",
  wind: "border-slate-400 bg-slate-50 text-slate-900",
} as const;

const FLAG_ICON = { storm: "⛈️", rain: "🌧️", heat: "🥵", cold: "🥶", wind: "💨" } as const;

function Details({ w, at, stale }: { w: GameWeather; at: number | null; stale: boolean }) {
  return (
    <>
      <p className="flex items-center gap-2">
        <span aria-hidden="true" className="text-3xl leading-none">
          {w.emoji}
        </span>
        <span className="text-2xl font-black">{w.temp}°</span>
        <span className="min-w-0 text-base font-semibold text-slate-700">{w.short}</span>
      </p>
      <p className="mt-1 text-sm text-slate-700">
        {w.rain}% rain · wind {w.wind} mph{w.windDir ? ` ${w.windDir}` : ""}
        {w.high !== w.low ? ` · ${w.low}–${w.high}°` : ""}
        {w.feelsLike !== null ? ` · feels like ${w.feelsLike}°` : ""}
      </p>
      {w.alerts.map((a) => (
        <p
          key={a.event + a.ends}
          role="alert"
          className="mt-2 rounded-lg border-2 border-red-600 bg-red-50 px-3 py-2 text-base font-bold text-red-900"
        >
          ⚠️ {a.event}
          {a.ends ? ` until ${formatClock(endsClock(a.ends))}` : ""}
        </p>
      ))}
      {w.flags.map((f) => (
        <p
          key={f.kind}
          className={`mt-2 rounded-lg border-l-4 px-3 py-1.5 text-sm font-semibold ${FLAG_CLASS[f.kind]}`}
        >
          <span aria-hidden="true">{FLAG_ICON[f.kind]} </span>
          {f.text}
        </p>
      ))}
      <p className={`mt-2 text-xs ${stale ? "font-semibold text-amber-800" : "text-slate-500"}`}>
        {at !== null ? `${stale ? "Forecast as of" : "Updated"} ${asOf(at)} · ` : ""}National
        Weather Service
      </p>
    </>
  );
}

/** "16:45" in this phone's clock from an ISO time. */
function endsClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The forecast for a game or practice. `compact` sits inside the game page's Game day card
 * (no card of its own); otherwise it's a card like Where.
 */
export function WeatherCard({
  place,
  date,
  time,
  hours = 2,
  compact = false,
}: {
  place: WeatherPlace;
  date: string;
  time: string | null;
  hours?: number;
  compact?: boolean;
}) {
  const { w, at, stale } = useWeather(place, date, time, hours);
  if (!w || w.status === "unavailable") return null;
  const body =
    w.status === "later" ? (
      <p className="text-base text-slate-600">Forecast shows up {shortDate(w.from)}.</p>
    ) : (
      <Details w={w} at={at} stale={stale} />
    );
  const heading = (
    <h2 className="text-sm font-bold tracking-wide text-slate-600 uppercase">
      Weather{time ? ` at ${formatClock(time.slice(0, 5))}` : ""}
    </h2>
  );
  if (compact) {
    return (
      <div>
        {heading}
        {body}
      </div>
    );
  }
  return (
    <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-3">
      {heading}
      {body}
    </section>
  );
}

/**
 * One tile for Home's next game, in the team's colors: "☀️ 72° · 10% rain", and the first
 * alert or flag under it.
 */
export function WeatherTile({
  place,
  date,
  time,
}: {
  place: WeatherPlace;
  date: string;
  time: string | null;
}) {
  const { w } = useWeather(place, date, time);
  if (!w || w.status !== "ok") return null;
  const alert = w.alerts[0]?.event ?? null;
  const note = alert ?? w.flags[0]?.text ?? null;
  return (
    <div className="col-span-2 min-w-0 rounded-xl bg-white/10 px-3 py-2">
      <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">Weather</p>
      <p className="truncate text-base font-bold">
        {weatherLine(w)} · {w.short}
      </p>
      {note && (
        <p
          className={`text-sm font-semibold ${alert ? "mt-1 rounded bg-white px-2 py-0.5 text-red-800" : "text-white/90"}`}
        >
          {alert ? `⚠️ ${alert}` : note}
        </p>
      )}
    </div>
  );
}
