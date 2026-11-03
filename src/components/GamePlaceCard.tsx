"use client";

import { useEffect, useState } from "react";
import { placeLabel } from "@/lib/data/game";
import type { Game } from "@/lib/data/types";
import { detectPlatform, isPhoneOrTablet, openInLinks, type GamePlace } from "@/lib/places/maps";

/** The browser key for showing maps (Maps Embed API only, locked to RallyCap's site). */
const EMBED_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ?? "";

/** Where the game is: location and field, the address, a map, and "Open in…" for this device. */
export function GamePlaceCard({ game }: { game: Game }) {
  const [links, setLinks] = useState<{ app: string; href: string }[]>([]);
  const [online, setOnline] = useState(true);
  const place: GamePlace = {
    name: game.location ?? "",
    address: game.locationAddress ?? null,
    lat: game.locationLat ?? null,
    lng: game.locationLng ?? null,
    placeId: game.locationPlaceId ?? null,
  };
  const label = placeLabel(game);

  useEffect(() => {
    if (!place.name) return;
    const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this device's maps apps
    setLinks(openInLinks(place, platform, isPhoneOrTablet(platform, navigator.userAgent)));
    setOnline(navigator.onLine);
    // The links only change with the place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.name, place.address, place.lat, place.lng, place.placeId]);

  if (!label) return null;
  const mapQuery = place.placeId
    ? `place_id:${place.placeId}`
    : place.lat !== null && place.lng !== null
      ? `${place.lat},${place.lng}`
      : place.address;
  const showMap = !!EMBED_KEY && !!mapQuery && online;

  return (
    <section className="mb-4 overflow-hidden rounded-xl border-2 border-slate-200 bg-white">
      <div className="p-3">
        <h2 className="text-sm font-bold tracking-wide text-slate-600 uppercase">Where</h2>
        <p className="text-lg font-bold">{game.location || game.field}</p>
        {game.location && game.field && <p className="text-base font-semibold">{game.field}</p>}
        {place.address && <p className="text-base text-slate-700">{place.address}</p>}
      </div>
      {showMap && (
        <iframe
          title={`Map of ${game.location}`}
          src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(EMBED_KEY)}&q=${encodeURIComponent(mapQuery!)}`}
          className="block h-48 w-full border-0 md:h-64"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      )}
      {place.name && links.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3">
          {links.map((l) => (
            <a
              key={l.app}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 flex-1 basis-36 items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-3 text-base font-bold active:bg-slate-100"
            >
              Open in {l.app}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
