"use client";

import { useState } from "react";
import type { AppData } from "@/lib/data/types";
import {
  guessOurTeam,
  newTeams,
  pickDivision,
  type EventDetails,
  type EventTeam,
} from "@/lib/tournaments/event";

const field =
  "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const heading = "text-sm font-bold tracking-wide text-slate-600 uppercase";

export interface ReadResult {
  event: EventDetails;
  url: string | null;
  pageHash: string | null;
}

/** Read an event from its link, or from a screenshot when the link can't be read. */
export async function readTournament(
  teamId: string,
  input: { url: string } | { file: File },
): Promise<ReadResult> {
  const res =
    "url" in input
      ? await fetch("/api/tournaments/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId, url: input.url }),
        })
      : await fetch("/api/tournaments/read", {
          method: "POST",
          body: (() => {
            const f = new FormData();
            f.set("teamId", teamId);
            f.set("file", input.file);
            return f;
          })(),
        });
  const json = (await res.json().catch(() => ({}))) as ReadResult & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Couldn't read the tournament. Try again.");
  return json;
}

/** Paste the event link (or add a screenshot), check what was found, save. */
export function AddTournament({ data, onSaved }: { data: AppData; onSaved: (id: string) => void }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<ReadResult | null>(null);

  const run = async (label: string, input: { url: string } | { file: File }) => {
    setBusy(label);
    setError(null);
    try {
      const r = await readTournament(data.team.id, input);
      // A screenshot after a link the site wouldn't let us read: keep the link on the
      // tournament (Open the event page, and the weekly check tries it again).
      if ("file" in input && !r.url && /^https:\/\/\S+$/i.test(link.trim())) {
        r.url = link.trim().slice(0, 500);
      }
      setRead(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <div className="size-10 animate-spin rounded-full border-4 border-slate-300 border-t-[var(--team)]" />
        <p className="text-lg font-semibold">{busy}</p>
        <p className="text-base text-slate-600">This takes about half a minute.</p>
      </div>
    );
  }

  if (read) {
    return (
      <Review
        data={data}
        read={read}
        onBack={() => setRead(null)}
        onSaved={onSaved}
        onScreenshot={(f) => void run("Reading the screenshot…", { file: f })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-slate-700">
        Paste the tournament&apos;s event page (2D Sports, Perfect Game, USSSA and others). RallyCap
        reads the dates, the fields and the teams in your division, and checks the link every Monday
        for teams that sign up later.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!link.trim()) {
            setError("Paste the event link first.");
            return;
          }
          void run("Reading the event page…", { url: link.trim() });
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">Event link</span>
          <input
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setError(null);
            }}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://youth.2dsports.org/events/…"
            className={field}
          />
        </label>
        <button
          type="submit"
          className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
        >
          Read the tournament
        </button>
      </form>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1 border-t-2 border-slate-100 pt-3">
        <p className="text-base text-slate-700">
          Link won&apos;t work (some sites block reading)? Use a screenshot of the team list.
        </p>
        <label className="flex h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100">
          Use a screenshot instead
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void run("Reading the screenshot…", { file: f });
            }}
          />
        </label>
      </div>
      <p className="text-sm text-slate-600">
        The page or screenshot is sent to Claude (Anthropic&apos;s AI) to read it. Nothing is saved
        until you confirm.
      </p>
    </div>
  );
}

function Review({
  data,
  read,
  onBack,
  onSaved,
  onScreenshot,
}: {
  data: AppData;
  read: ReadResult;
  onBack: () => void;
  onSaved: (id: string) => void;
  onScreenshot: (f: File) => void;
}) {
  const { event } = read;
  const [name, setName] = useState(event.name ?? "");
  const [division, setDivision] = useState(
    () => pickDivision(event.divisions, data.team.ageGroup) ?? event.divisions[0]?.name ?? "",
  );
  const teams: EventTeam[] = newTeams(
    [],
    event.divisions.find((d) => d.name === division)?.teams ?? [],
  );
  const [ours, setOurs] = useState<string | null>(() => guessOurTeam(teams, data.team.name));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!event.isEvent || (event.divisions.length === 0 && !event.name)) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-base">
          That doesn&apos;t look like a tournament page.
          {event.warnings.length > 0 && ` ${event.warnings.join(" ")}`}
        </p>
        <ScreenshotButton onFile={onScreenshot} />
        <button onClick={onBack} className="h-12 rounded-xl border-2 border-slate-400 font-bold">
          Back
        </button>
      </div>
    );
  }

  const save = async () => {
    if (!name.trim()) {
      setError("Give the tournament a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await (
        await import("@/lib/data/tournament-backend")
      ).createTournament({
        teamId: data.team.id,
        seasonId: data.season.id,
        event,
        name,
        division: division || null,
        teams,
        ourTeam: ours,
        url: read.url,
        pageHash: read.pageHash,
      });
      onSaved(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const when = [event.startDate, event.endDate]
    .filter((d, i, all) => d && all.indexOf(d) === i)
    .map((d) =>
      new Date(`${d}T12:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    )
    .join(" – ");

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Tournament</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className={field}
        />
      </label>
      <p className="text-base text-slate-700">
        {[event.organization, when, event.city].filter(Boolean).join(" · ") ||
          "Dates not shown yet"}
        {event.venues.length > 0 && (
          <span className="block text-sm text-slate-600">Fields: {event.venues.join(", ")}</span>
        )}
      </p>
      {event.warnings.length > 0 && (
        <ul className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-base text-amber-950">
          {event.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {event.divisions.length > 0 ? (
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">Your division</span>
          <select
            value={division}
            onChange={(e) => {
              setDivision(e.target.value);
              setOurs(null);
            }}
            className={field}
          >
            {event.divisions.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} ({d.teams.length} teams)
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-base text-slate-700">
          No teams are listed yet. The weekly check adds them as they sign up.
        </p>
      )}

      {teams.length > 0 && (
        <section>
          <h3 className={`${heading} mb-2`}>Which team is yours?</h3>
          <ul className="flex flex-col gap-2">
            {teams.map((t) => (
              <li key={t.name}>
                <label
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 bg-white px-3 py-2 ${ours === t.name ? "border-[var(--team)]" : "border-slate-200"}`}
                >
                  <input
                    type="radio"
                    name="ours"
                    checked={ours === t.name}
                    onChange={() => setOurs(t.name)}
                    className="size-5 shrink-0 accent-[var(--team)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">{t.name}</span>
                    <span className="block text-sm text-slate-600">
                      {[t.hometown, t.classLabel].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            <li>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-white px-3">
                <input
                  type="radio"
                  name="ours"
                  checked={ours === null}
                  onChange={() => setOurs(null)}
                  className="size-5 shrink-0 accent-[var(--team)]"
                />
                <span className="text-base">Not listed yet</span>
              </label>
            </li>
          </ul>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex gap-3 bg-white px-4 pt-2 pb-1">
        <button
          onClick={onBack}
          disabled={saving}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold disabled:opacity-40"
        >
          Back
        </button>
        <button
          onClick={() => void save()}
          disabled={saving}
          className="h-14 flex-[2] rounded-xl bg-green-700 text-lg font-bold text-white disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save tournament"}
        </button>
      </div>
    </div>
  );
}

export function ScreenshotButton({
  onFile,
  label = "Use a screenshot instead",
}: {
  onFile: (f: File) => void;
  label?: string;
}) {
  return (
    <label className="flex h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100">
      {label}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </label>
  );
}
