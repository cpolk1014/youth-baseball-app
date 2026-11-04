"use client";

import { PlaceSearch } from "./PlaceSearch";
import type { GamePlace } from "@/lib/places/maps";
import { useState } from "react";
import { localDateString } from "@/lib/data/game";
import type { Practice } from "@/lib/data/types";
import { PRACTICE_FOCUSES } from "@/lib/practice/drills";
import { generatePracticeDates, practiceMinutes } from "@/lib/practice/schedule";

const field =
  "h-12 w-full min-w-0 rounded-lg border-2 border-slate-400 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const label = "text-sm font-semibold text-slate-700";
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** "2026-10-27" -> "Oct 27" */
function shortDate(d: string): string {
  return new Date(`${d}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function FocusPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div role="group" aria-label="Focus" className="flex flex-col gap-1">
      <span className={label}>
        Focus <span className="font-normal">(optional)</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {PRACTICE_FOCUSES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={value === f}
            onClick={() => onChange(value === f ? null : f)}
            className={`h-10 rounded-full border-2 px-3 text-sm font-bold ${
              value === f
                ? "border-[var(--team)] bg-[var(--team)] text-white"
                : "border-slate-300 bg-white text-slate-800"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimeFields({
  start,
  end,
  onStart,
  onEnd,
}: {
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  return (
    <div className="flex gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={label}>Starts</span>
        <input
          type="time"
          value={start}
          onChange={(e) => onStart(e.target.value)}
          className={field}
        />
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={label}>Ends</span>
        <input type="time" value={end} onChange={(e) => onEnd(e.target.value)} className={field} />
      </label>
    </div>
  );
}

function Buttons({
  onCancel,
  submit,
  disabled,
}: {
  onCancel: () => void;
  submit: string;
  disabled: boolean;
}) {
  return (
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
        disabled={disabled}
        className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
      >
        {submit}
      </button>
    </div>
  );
}

const NO_PLACE: GamePlace = { name: "", address: null, lat: null, lng: null, placeId: null };

/** A practice's place fields from the search and the field box (map details only for a pick). */
function placeFields(place: GamePlace, fieldName: string) {
  const name = place.name.trim();
  return {
    location: name || null,
    field: fieldName.trim() || null,
    locationAddress: name ? place.address : null,
    locationLat: name ? place.lat : null,
    locationLng: name ? place.lng : null,
    locationPlaceId: name ? place.placeId : null,
  };
}

/** Location (searched on Google Maps, recent places first) and the field, as on games. */
function PlaceInputs({
  place,
  onPlace,
  fieldName,
  onFieldName,
  recent,
}: {
  place: GamePlace;
  onPlace: (p: GamePlace) => void;
  fieldName: string;
  onFieldName: (f: string) => void;
  recent: GamePlace[];
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className={label}>
          Location <span className="font-normal">(optional)</span>
        </span>
        <PlaceSearch value={place} recent={recent} onChange={onPlace} className={field} />
      </div>
      <label className="flex flex-col gap-1">
        <span className={label}>
          Field <span className="font-normal">(optional)</span>
        </span>
        <input
          value={fieldName}
          onChange={(e) => onFieldName(e.target.value)}
          maxLength={60}
          autoComplete="off"
          placeholder="e.g. Chabills Field"
          className={field}
        />
      </label>
    </>
  );
}

/** Add or edit one practice's date, time, field and focus. */
export function PracticeForm({
  practice,
  recentPlaces = [],
  onSave,
  onCancel,
}: {
  practice: Practice;
  /** Places the team has played or practiced, offered first when typing a location. */
  recentPlaces?: GamePlace[];
  onSave: (p: Practice) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(practice.date);
  const [start, setStart] = useState(practice.startTime ?? "");
  const [end, setEnd] = useState(practice.endTime ?? "");
  const [place, setPlace] = useState<GamePlace>({
    name: practice.location ?? "",
    address: practice.locationAddress ?? null,
    lat: practice.locationLat ?? null,
    lng: practice.locationLng ?? null,
    placeId: practice.locationPlaceId ?? null,
  });
  const [fieldName, setFieldName] = useState(practice.field ?? "");
  const [focus, setFocus] = useState(practice.focus);
  const badTimes = start !== "" && end !== "" && practiceMinutes(start, end) === null;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !badTimes;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSave({
          ...practice,
          date,
          startTime: start || null,
          endTime: end || null,
          ...placeFields(place, fieldName),
          focus,
        });
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1">
        <span className={label}>Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={field}
        />
      </label>
      <TimeFields start={start} end={end} onStart={setStart} onEnd={setEnd} />
      {badTimes && (
        <p className="-mt-2 text-sm font-semibold text-red-700">
          End time must be after the start.
        </p>
      )}
      <PlaceInputs
        place={place}
        onPlace={setPlace}
        fieldName={fieldName}
        onFieldName={setFieldName}
        recent={recentPlaces}
      />
      <FocusPicker value={focus} onChange={setFocus} />
      <Buttons onCancel={onCancel} submit="Save" disabled={!valid} />
    </form>
  );
}

/** Create a season of practices: weekdays between two dates, same time and field. */
export function ScheduleBuilder({
  seasonId,
  existingDates,
  onCreate,
  onCancel,
  newId,
  recentPlaces = [],
}: {
  seasonId: string;
  recentPlaces?: GamePlace[];
  /** Dates that already have a practice; they're skipped. */
  existingDates: Set<string>;
  onCreate: (practices: Practice[]) => void;
  onCancel: () => void;
  newId: () => string;
}) {
  const today = new Date();
  const inEightWeeks = new Date(today.getTime() + 56 * 86_400_000);
  const [startDate, setStartDate] = useState(localDateString(today));
  const [endDate, setEndDate] = useState(localDateString(inEightWeeks));
  const [weekdays, setWeekdays] = useState<number[]>([2, 4]);
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("19:30");
  const [place, setPlace] = useState<GamePlace>(NO_PLACE);
  const [fieldName, setFieldName] = useState("");

  const dates = generatePracticeDates({ start: startDate, end: endDate, weekdays }).filter(
    (d) => !existingDates.has(d),
  );
  const badTimes = start !== "" && end !== "" && practiceMinutes(start, end) === null;
  const toggle = (d: number) =>
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (dates.length === 0 || badTimes) return;
        onCreate(
          dates.map((date) => ({
            id: newId(),
            seasonId,
            date,
            startTime: start || null,
            endTime: end || null,
            ...placeFields(place, fieldName),
            focus: null,
            notes: null,
            plan: [],
            canceled: false,
            plays: [],
          })),
        );
      }}
      className="flex flex-col gap-4"
    >
      <div role="group" aria-label="Practice days" className="flex flex-col gap-1">
        <span className={label}>Practice days</span>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={weekdays.includes(i)}
              aria-label={WEEKDAY_NAMES[i]}
              onClick={() => toggle(i)}
              className={`h-12 rounded-lg border-2 text-base font-bold ${
                weekdays.includes(i)
                  ? "border-[var(--team)] bg-[var(--team)] text-white"
                  : "border-slate-300 bg-white"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={label}>From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={label}>Through</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <TimeFields start={start} end={end} onStart={setStart} onEnd={setEnd} />
      {badTimes && (
        <p className="-mt-2 text-sm font-semibold text-red-700">
          End time must be after the start.
        </p>
      )}
      <PlaceInputs
        place={place}
        onPlace={setPlace}
        fieldName={fieldName}
        onFieldName={setFieldName}
        recent={recentPlaces}
      />
      <p className="rounded-lg bg-slate-100 p-3 text-base" role="status">
        {dates.length === 0
          ? "No new practice dates in that range."
          : `${dates.length} practice${dates.length === 1 ? "" : "s"}, ${shortDate(dates[0]!)} to ${shortDate(dates[dates.length - 1]!)}.`}
        {existingDates.size > 0 && dates.length > 0
          ? " Days that already have a practice are skipped."
          : ""}
      </p>
      <Buttons
        onCancel={onCancel}
        submit={
          dates.length
            ? `Add ${dates.length} practice${dates.length === 1 ? "" : "s"}`
            : "Add practices"
        }
        disabled={dates.length === 0 || badTimes}
      />
    </form>
  );
}
