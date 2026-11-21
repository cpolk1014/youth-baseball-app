"use client";

// GIFs in Chatter: the picker (trending, or a search; G-rated, from GIPHY through our server)
// and the GIF on a post (a short looping video, or a still frame for reduced motion).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ChatterGif } from "@/lib/chatter/gif";

const QUERY = "(prefers-reduced-motion: reduce)";

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (on) => {
      const q = window.matchMedia?.(QUERY);
      q?.addEventListener("change", on);
      return () => q?.removeEventListener("change", on);
    },
    () => window.matchMedia?.(QUERY).matches ?? false,
    () => false,
  );
}

/** A GIF on a post: plays muted on a loop, sized to fit a phone. */
export function GifView({ gif }: { gif: ChatterGif }) {
  const reduced = useReducedMotion();
  const width = Math.min(260, gif.w * 1.3);
  const style = { width, aspectRatio: `${gif.w} / ${gif.h}` };
  return reduced ? (
    // eslint-disable-next-line @next/next/no-img-element -- GIPHY's still frame
    <img
      src={gif.still}
      alt={gif.title || "GIF"}
      style={style}
      className="rounded-xl bg-slate-100"
    />
  ) : (
    <video
      src={gif.mp4}
      poster={gif.still}
      autoPlay
      loop
      muted
      playsInline
      aria-label={gif.title || "GIF"}
      style={style}
      className="rounded-xl bg-slate-100"
    />
  );
}

/** Pick a GIF: trending first, or search. */
export function GifPicker({ onPick }: { onPick: (gif: ChatterGif) => void }) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<ChatterGif[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);

  const load = async (query: string, offset: number) => {
    const ask = ++asked.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/gifs/search?${new URLSearchParams({ q: query, offset: String(offset) })}`,
      );
      const body = (await res.json().catch(() => ({}))) as {
        gifs?: ChatterGif[];
        next?: number | null;
        error?: string;
      };
      if (ask !== asked.current) return;
      if (!res.ok) throw new Error(body.error ?? "GIFs aren't loading right now.");
      setGifs((prev) => (offset ? [...prev, ...(body.gifs ?? [])] : (body.gifs ?? [])));
      setNext(body.next ?? null);
    } catch (e) {
      if (ask === asked.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (ask === asked.current) setLoading(false);
    }
  };

  // Trending on open; then search as they type (after a short pause).
  useEffect(() => {
    const t = window.setTimeout(() => void load(q.trim(), 0), q ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <div className="flex flex-col gap-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search GIFs"
        aria-label="Search GIFs"
        enterKeyHint="search"
        maxLength={50}
        className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
      />
      {error && <p className="rounded-xl bg-red-50 p-3 text-base text-red-900">{error}</p>}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {gifs.map((g) => (
          <li key={g.id}>
            <button
              onClick={() => onPick(g)}
              aria-label={g.title || "GIF"}
              className="block w-full overflow-hidden rounded-xl bg-slate-100 active:opacity-70"
              style={{ aspectRatio: `${g.w} / ${g.h}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- GIPHY's still frame */}
              <img src={g.still} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {!loading && !error && gifs.length === 0 && (
        <p className="text-center text-base text-slate-600">No GIFs for that. Try another word.</p>
      )}
      {next !== null && !loading && (
        <button
          onClick={() => void load(q.trim(), next)}
          className="h-12 rounded-xl border-2 border-slate-300 bg-white text-base font-bold"
        >
          More GIFs
        </button>
      )}
      {loading && <p className="text-center text-base text-slate-500">Loading…</p>}
      <p className="text-center text-xs font-bold tracking-wide text-slate-500 uppercase">
        Powered by GIPHY
      </p>
    </div>
  );
}
