"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useStoreState } from "@/lib/data/store";
import type { GamePlace } from "@/lib/places/maps";

interface Suggestion {
  placeId: string;
  name: string;
  detail: string;
}

const newSession = () => crypto.randomUUID();

/**
 * A game's location: type to get suggestions (this team's recent places first, then Google
 * Maps), pick one to get its address and map position. Typing without picking keeps just
 * the name, as before.
 */
export function PlaceSearch({
  value,
  recent,
  onChange,
  className,
}: {
  value: GamePlace;
  recent: GamePlace[];
  onChange: (place: GamePlace) => void;
  className: string;
}) {
  const { mode } = useStoreState();
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<Suggestion[]>([]);
  const [picking, setPicking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const session = useRef(newSession());
  const listId = useId();
  const text = value.name;

  // Google suggestions, a moment after typing stops.
  useEffect(() => {
    if (mode !== "supabase" || unavailable || text.trim().length < 3 || value.placeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to look up
      setFound([]);
      return;
    }
    let current = true;
    const t = setTimeout(async () => {
      const res = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text, session: session.current }),
      }).catch(() => null);
      if (!current) return;
      if (!res || res.status === 503) {
        setUnavailable(true);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { places?: Suggestion[] };
      setFound(json.places ?? []);
    }, 300);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [text, mode, unavailable, value.placeId]);

  const q = text.trim().toLowerCase();
  const recentMatches = recent
    .filter((p) => p.name !== value.name && (!q || p.name.toLowerCase().includes(q)))
    .slice(0, 4);

  const pickGoogle = async (s: Suggestion) => {
    setPicking(true);
    setOpen(false);
    try {
      const res = await fetch("/api/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: s.placeId, session: session.current }),
      });
      const d = (await res.json()) as {
        address?: string | null;
        lat?: number | null;
        lng?: number | null;
      };
      onChange({
        name: s.name,
        address: res.ok ? (d.address ?? s.detail ?? null) : s.detail || null,
        lat: res.ok ? (d.lat ?? null) : null,
        lng: res.ok ? (d.lng ?? null) : null,
        placeId: s.placeId,
      });
    } finally {
      session.current = newSession(); // the next search is a new session
      setPicking(false);
    }
  };

  const showList = open && (recentMatches.length > 0 || found.length > 0);
  return (
    <div className="relative">
      <input
        value={text}
        onChange={(e) => {
          onChange({ name: e.target.value, address: null, lat: null, lng: null, placeId: null });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        maxLength={80}
        autoComplete="off"
        placeholder="Start typing, e.g. Traction Sports Complex"
        role="combobox"
        aria-controls={listId}
        aria-expanded={showList}
        aria-autocomplete="list"
        className={className}
      />
      {picking && <p className="mt-1 text-sm text-slate-600">Getting the address…</p>}
      {value.address && !picking && (
        <p className="mt-1 flex items-start gap-1 text-sm text-slate-700">
          <span aria-hidden="true">📍</span>
          <span className="min-w-0 flex-1">{value.address}</span>
        </p>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border-2 border-slate-300 bg-white shadow-lg"
        >
          {recentMatches.map((p) => (
            <li key={`r-${p.name}`} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className="flex min-h-14 w-full flex-col justify-center px-3 py-2 text-left active:bg-slate-100"
              >
                <span className="text-base font-semibold">{p.name}</span>
                <span className="text-sm text-slate-600">
                  Used before{p.address ? ` · ${p.address}` : ""}
                </span>
              </button>
            </li>
          ))}
          {found.map((s) => (
            <li key={s.placeId} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pickGoogle(s)}
                className="flex min-h-14 w-full flex-col justify-center border-t border-slate-100 px-3 py-2 text-left active:bg-slate-100"
              >
                <span className="text-base font-semibold">{s.name}</span>
                <span className="text-sm text-slate-600">{s.detail}</span>
              </button>
            </li>
          ))}
          {found.length > 0 && (
            <li className="border-t border-slate-100 px-3 py-1 text-right text-xs text-slate-500">
              powered by Google
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
