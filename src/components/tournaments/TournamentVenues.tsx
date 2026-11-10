"use client";

import { useState } from "react";
import { recentPlaces } from "@/lib/data/game";
import type { Tournament } from "@/lib/data/tournament-backend";
import type { AppData } from "@/lib/data/types";
import type { GamePlace } from "@/lib/places/maps";
import { addPlaces } from "@/lib/tournaments/venues";
import { GamePlaceCard } from "../GamePlaceCard";
import { PlaceSearch } from "../PlaceSearch";
import { Sheet } from "../Sheet";
import { PaidGate } from "../paywall";
import { ScreenshotButton, sendScreenshots } from "./AddTournament";

const field =
  "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const EMPTY: GamePlace = { name: "", address: null, lat: null, lng: null, placeId: null };

/** Where the tournament is: its parks, which everyone can open in a maps app. */
export function TournamentVenues({
  data,
  tournament,
  canEdit,
  ourGames,
  onSave,
}: {
  data: AppData;
  tournament: Tournament;
  canEdit: boolean;
  ourGames: number;
  onSave: (places: GamePlace[]) => Promise<string>;
}) {
  const places = tournament.places;
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: GamePlace[]) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      setNote(await onSave(next));
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border-2 border-slate-200 bg-white p-4">
      <h2 className={heading}>Where</h2>
      {places.length === 0 ? (
        <p className="text-base text-slate-700">
          {canEdit
            ? "Add the park and every game in this tournament gets its address and map."
            : "The park hasn't been added yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4 divide-y divide-slate-100">
          {places.map((p, i) => (
            <li key={p.placeId ?? p.name} className={i ? "pt-4" : ""}>
              <GamePlaceCard
                bare
                game={{
                  location: p.name,
                  field: null,
                  locationAddress: p.address,
                  locationLat: p.lat,
                  locationLng: p.lng,
                  locationPlaceId: p.placeId,
                }}
              />
              {canEdit && (
                <button
                  onClick={() => void save(places.filter((x) => x !== p))}
                  disabled={busy}
                  aria-label={`Remove ${p.name}`}
                  className="mt-2 h-10 text-sm font-semibold text-red-700 disabled:opacity-40"
                >
                  Remove this park
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <button
          onClick={() => {
            setError(null);
            setNote(null);
            setAdding(true);
          }}
          className="mt-3 h-12 w-full rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100"
        >
          {places.length ? "Add another park" : "Add the park"}
        </button>
      )}
      {note && (
        <p role="status" className="mt-2 text-base font-semibold text-green-800">
          {note}
        </p>
      )}
      {error && !adding && (
        <p role="alert" className="mt-2 text-base font-semibold text-red-700">
          {error}
        </p>
      )}
      <Sheet open={adding} title="Add a park" onClose={() => setAdding(false)}>
        {adding && (
          <AddVenue
            data={data}
            tournament={tournament}
            ourGames={ourGames}
            saving={busy}
            saveError={error}
            onAdd={(found) => void save(addPlaces(places, found))}
          />
        )}
      </Sheet>
    </section>
  );
}

/** Search the map, or upload a picture and check what it found. */
function AddVenue({
  data,
  tournament,
  ourGames,
  saving,
  saveError,
  onAdd,
}: {
  data: AppData;
  tournament: Tournament;
  ourGames: number;
  saving: boolean;
  saveError: string | null;
  onAdd: (places: GamePlace[]) => void;
}) {
  const [place, setPlace] = useState<GamePlace>(EMPTY);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [found, setFound] = useState<{ place: GamePlace; keep: boolean }[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const recent = recentPlaces(data.games);

  const read = async (files: File[]) => {
    setReading(true);
    setReadError(null);
    try {
      const { venues } = await sendScreenshots<{
        venues?: { places: GamePlace[]; warnings: string[] };
      }>({ teamId: data.team.id, tournamentId: tournament.id, kind: "venue" }, files);
      if (!venues) throw new Error("Couldn't read that picture. Try again.");
      if (venues.places.length === 0) {
        setReadError(
          venues.warnings[0] ?? "No ballpark showed up in that picture. Try searching the map.",
        );
        return;
      }
      setFound(venues.places.map((p) => ({ place: p, keep: true })));
      setWarnings(venues.warnings);
    } catch (e) {
      setReadError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  };

  // Who the park applies to, said before saving.
  const already = tournament.places.length;
  const effect =
    already > 0
      ? "With more than one park, each game goes to the park named on its schedule."
      : ourGames > 0
        ? `All ${ourGames === 1 ? "1 of our games" : `${ourGames} of our games`} in this tournament will use this place.`
        : "Our games in this tournament will use this place.";
  const failed = saveError && (
    <p role="alert" className="text-base font-semibold text-red-700">
      {saveError}
    </p>
  );

  if (reading) {
    return (
      <p role="status" className="py-8 text-center text-lg font-semibold">
        Reading the picture and finding it on the map…
      </p>
    );
  }

  if (found) {
    const kept = found.filter((f) => f.keep && f.place.name.trim()).map((f) => f.place);
    return (
      <div className="flex flex-col gap-4">
        <p className="text-base text-slate-700">
          Check {found.length === 1 ? "it's" : "they're"} the right place. Not quite? Type over the
          name to search again.
        </p>
        <ul className="flex flex-col gap-4">
          {found.map((f, i) => (
            <li key={i} className="flex items-start gap-3">
              <input
                type="checkbox"
                aria-label={`Add ${f.place.name}`}
                checked={f.keep}
                onChange={(e) =>
                  setFound(found.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))
                }
                className="mt-3 size-6 shrink-0 accent-[var(--team)]"
              />
              <div className="min-w-0 flex-1">
                <PlaceSearch
                  value={f.place}
                  recent={[]}
                  onChange={(p) =>
                    setFound(found.map((x, j) => (j === i ? { ...x, place: p } : x)))
                  }
                  className={field}
                />
                {!f.place.placeId && f.place.name.trim() && (
                  <p className="mt-1 text-sm text-amber-800">
                    Couldn&apos;t find this one on the map. Type over the name to search, or save it
                    as it is.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {warnings.length > 0 && (
          <ul className="text-sm text-slate-600">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <p className="text-sm text-slate-600">{effect}</p>
        {failed}
        <button
          onClick={() => onAdd(kept)}
          disabled={saving || kept.length === 0}
          className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40"
        >
          {saving ? "Saving…" : kept.length > 1 ? `Add ${kept.length} parks` : "Add this park"}
        </button>
        <button
          onClick={() => setFound(null)}
          disabled={saving}
          className="h-12 rounded-xl border-2 border-slate-400 text-base font-bold"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-base font-semibold">Search the map</p>
        <PlaceSearch value={place} recent={recent} onChange={setPlace} className={field} />
      </div>
      <p className="text-sm text-slate-600">{effect}</p>
      {failed}
      <button
        onClick={() => onAdd([place])}
        disabled={saving || !place.name.trim()}
        className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40"
      >
        {saving ? "Saving…" : "Use this place"}
      </button>
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <PaidGate feature="Reading a park from a picture">
        <div className="flex flex-col gap-2">
          <ScreenshotButton onFiles={(f) => void read(f)} label="📷 Upload a picture" />
          <p className="text-sm text-slate-600">
            A flyer, the event page or a map. RallyCap reads the park and finds it on the map, and
            you check it before it&apos;s saved. The picture isn&apos;t kept.
          </p>
        </div>
      </PaidGate>
      {readError && (
        <p role="alert" className="text-base font-semibold text-red-700">
          {readError}
        </p>
      )}
    </div>
  );
}
