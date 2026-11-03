"use client";

import { useState } from "react";
import type { GamePlace } from "@/lib/places/maps";
import { PlaceSearch } from "./PlaceSearch";
import { validateGameInput, type GameInput } from "@/lib/data/game";
import type { Game } from "@/lib/data/types";

const field =
  "h-12 w-full rounded-lg border-2 border-slate-400 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";

export function GameForm({
  game,
  filledInnings,
  onSave,
  onCancel,
  arriveMinutes,
  recentPlaces = [],
}: {
  game: Game;
  /** Last inning with saved positions, to warn before shortening the game. */
  filledInnings: number;
  onSave: (game: Game) => void;
  onCancel: () => void;
  /** The team's "arrive this many minutes before", for the Arrive by hint. */
  arriveMinutes?: number | null;
  /** Places the team has played, offered first when typing a location. */
  recentPlaces?: GamePlace[];
}) {
  const [input, setInput] = useState<GameInput>({
    opponent: game.opponent,
    date: game.date,
    startTime: game.startTime ?? "",
    location: game.location ?? "",
    innings: game.innings,
    fieldPlayers: game.fieldPlayers,
  });
  const [arrive, setArrive] = useState(game.arriveTime ?? "");
  const [fieldName, setFieldName] = useState(game.field ?? "");
  const [place, setPlace] = useState<GamePlace>({
    name: game.location ?? "",
    address: game.locationAddress ?? null,
    lat: game.locationLat ?? null,
    lng: game.locationLng ?? null,
    placeId: game.locationPlaceId ?? null,
  });
  const [submitted, setSubmitted] = useState(false);
  const errors = validateGameInput(input);
  const shown = submitted ? errors : {};
  const set = <K extends keyof GameInput>(key: K, value: GameInput[K]) =>
    setInput((cur) => ({ ...cur, [key]: value }));

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (Object.keys(errors).length > 0) return;
        onSave({
          ...game,
          opponent: input.opponent.trim(),
          date: input.date,
          startTime: input.startTime || null,
          location: input.location.trim() || null,
          field: fieldName.trim() || null,
          // Map details only for a picked place (cleared when the name is typed over).
          locationAddress: input.location.trim() ? place.address : null,
          locationLat: input.location.trim() ? place.lat : null,
          locationLng: input.location.trim() ? place.lng : null,
          locationPlaceId: input.location.trim() ? place.placeId : null,
          arriveTime: arrive || null,
          innings: input.innings,
          fieldPlayers: input.fieldPlayers === 10 ? 10 : 9,
        });
      }}
      className="flex flex-col gap-4"
    >
      <Field label="Opponent" error={shown.opponent}>
        <input
          value={input.opponent}
          onChange={(e) => set("opponent", e.target.value)}
          maxLength={60}
          autoComplete="off"
          className={field}
        />
      </Field>

      <div className="flex gap-3">
        <Field label="Date" error={shown.date} className="flex-[3]">
          <input
            type="date"
            value={input.date}
            onChange={(e) => set("date", e.target.value)}
            className={field}
          />
        </Field>
        <Field label="Start time" hint="optional" error={shown.startTime} className="flex-[2]">
          <input
            type="time"
            value={input.startTime}
            onChange={(e) => set("startTime", e.target.value)}
            className={field}
          />
        </Field>
      </div>

      <Field
        label="Arrive by"
        hint={
          arriveMinutes != null
            ? `optional · team default: ${arriveMinutes} min before`
            : "optional"
        }
      >
        <div className="flex gap-2">
          <input
            type="time"
            value={arrive}
            onChange={(e) => setArrive(e.target.value)}
            className={field}
          />
          {arrive && (
            <button
              type="button"
              onClick={() => setArrive("")}
              className="h-12 shrink-0 rounded-xl border-2 border-slate-300 px-3 text-base font-semibold active:bg-slate-100"
            >
              Use default
            </button>
          )}
        </div>
      </Field>

      <Field label="Location" hint="optional">
        <PlaceSearch
          value={{ ...place, name: input.location }}
          recent={recentPlaces}
          onChange={(p) => {
            set("location", p.name);
            setPlace(p);
          }}
          className={field}
        />
      </Field>

      <Field label="Field" hint="optional">
        <input
          value={fieldName}
          onChange={(e) => setFieldName(e.target.value)}
          maxLength={60}
          autoComplete="off"
          placeholder="e.g. Chabills Field"
          className={field}
        />
      </Field>

      <Field label="Innings" error={shown.innings} group>
        <div className="flex items-center gap-3">
          <StepButton
            label="Fewer innings"
            disabled={input.innings <= 1}
            onClick={() => set("innings", input.innings - 1)}
          >
            −
          </StepButton>
          <span className="w-12 text-center text-3xl font-bold" aria-live="polite">
            {input.innings}
          </span>
          <StepButton
            label="More innings"
            disabled={input.innings >= 9}
            onClick={() => set("innings", input.innings + 1)}
          >
            +
          </StepButton>
        </div>
      </Field>
      <Field label="Field players" error={shown.fieldPlayers} group>
        <div className="grid grid-cols-2 gap-2">
          {([9, 10] as const).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={input.fieldPlayers === n}
              onClick={() => set("fieldPlayers", n)}
              className={`flex h-14 flex-col items-center justify-center rounded-xl border-2 ${
                input.fieldPlayers === n
                  ? "border-[var(--team)] bg-[var(--team)] text-white"
                  : "border-slate-300 bg-white active:bg-slate-100"
              }`}
            >
              <span className="text-xl leading-tight font-bold">{n}</span>
              <span
                className={`text-xs ${input.fieldPlayers === n ? "text-white/80" : "text-slate-600"}`}
              >
                {n === 9 ? "LF · CF · RF" : "LF · LCF · RCF · RF"}
              </span>
            </button>
          ))}
        </div>
      </Field>
      {input.innings < filledInnings && (
        <p className="-mt-2 rounded-lg bg-amber-100 p-2 text-sm font-semibold text-amber-950">
          The lineup has positions through inning {filledInnings}. Saving drops{" "}
          {input.innings + 1 === filledInnings
            ? `inning ${filledInnings}`
            : `innings ${input.innings + 1}–${filledInnings}`}
          .
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold text-slate-800 active:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
        >
          Save
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  className = "",
  group = false,
  children,
}: {
  label: string;
  /** Render as a group instead of a <label> (for fields made of several buttons). */
  group?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const Tag = group ? "div" : "label";
  return (
    <Tag
      role={group ? "group" : undefined}
      aria-label={group ? label : undefined}
      className={`flex min-w-0 flex-col gap-1 ${className}`}
    >
      <span className="text-sm font-semibold text-slate-700">
        {label} {hint && <span className="font-normal">({hint})</span>}
      </span>
      {children}
      {error && <span className="text-sm font-semibold text-red-700">{error}</span>}
    </Tag>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="size-12 rounded-lg border-2 border-slate-400 bg-white text-2xl font-bold disabled:opacity-30 active:bg-slate-100"
    >
      {children}
    </button>
  );
}
