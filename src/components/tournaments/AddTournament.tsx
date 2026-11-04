"use client";

import { useEffect, useState } from "react";
import { shrinkImage } from "../receiptFile";
import type { TournamentLinks } from "@/lib/data/tournament-backend";
import type { AppData } from "@/lib/data/types";
import {
  MAX_SCREENSHOTS,
  guessOurTeam,
  newTeams,
  pickDivision,
  tournamentLink,
  type EventDetails,
  type EventTeam,
} from "@/lib/tournaments/event";

const field =
  "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const heading = "text-sm font-bold tracking-wide text-slate-600 uppercase";

/** Screenshots are shrunk on the phone so several fit in one upload and stay readable. */
const SCREENSHOT_MAX_SIDE = 2000;

/** Read screenshots of a tournament (its event page, team list) together as one event. */
export async function readTournament(teamId: string, files: File[]): Promise<EventDetails> {
  const form = new FormData();
  form.set("teamId", teamId);
  for (const [i, f] of files.slice(0, MAX_SCREENSHOTS).entries()) {
    const blob = await shrinkImage(f, SCREENSHOT_MAX_SIDE);
    form.append("file", blob, `screenshot-${i + 1}.${blob.type === "image/jpeg" ? "jpg" : "png"}`);
  }
  const res = await fetch("/api/tournaments/read", { method: "POST", body: form });
  const json = (await res.json().catch(() => ({}))) as { event?: EventDetails; error?: string };
  if (!res.ok || !json.event) {
    throw new Error(json.error ?? "Couldn't read the screenshots. Try again.");
  }
  return json.event;
}

/** Add screenshots, check what was found, add the links, save. */
export function AddTournament({ data, onSaved }: { data: AppData; onSaved: (id: string) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetails | null>(null);

  const add = (picked: File[]) => {
    setError(null);
    const all = [...files, ...picked];
    if (all.length > MAX_SCREENSHOTS) setError(`Up to ${MAX_SCREENSHOTS} screenshots at a time.`);
    setFiles(all.slice(0, MAX_SCREENSHOTS));
  };

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      setEvent(await readTournament(data.team.id, files));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <div className="size-10 animate-spin rounded-full border-4 border-slate-300 border-t-[var(--team)]" />
        <p className="text-lg font-semibold">
          Reading {files.length === 1 ? "the screenshot" : `${files.length} screenshots`}…
        </p>
        <p className="text-base text-slate-600">This takes about half a minute.</p>
      </div>
    );
  }

  if (event) {
    return <Review data={data} event={event} onBack={() => setEvent(null)} onSaved={onSaved} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-slate-700">
        Take screenshots of the tournament&apos;s page: the top with the name, dates and city, and
        the Teams tab if teams are listed (more than one if the list is long). RallyCap fills in the
        details and adds the teams in your division.
      </p>
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.lastModified}-${i}`} className="relative">
              <Thumb file={f} />
              <button
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                aria-label={`Remove screenshot ${i + 1}`}
                className="absolute top-1 right-1 flex size-9 items-center justify-center rounded-full bg-slate-900/75 text-lg font-bold text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < MAX_SCREENSHOTS && (
        <ScreenshotButton
          onFiles={add}
          label={files.length ? "Add more screenshots" : "Add screenshots"}
          primary={files.length === 0}
        />
      )}
      {files.length > 0 && (
        <button
          onClick={() => void read()}
          className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
        >
          Read {files.length === 1 ? "the screenshot" : `${files.length} screenshots`}
        </button>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <p className="text-sm text-slate-600">
        Screenshots are sent to Claude (Anthropic&apos;s AI) to read them and aren&apos;t kept.
        Nothing is saved until you confirm.
      </p>
    </div>
  );
}

function Thumb({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a preview for this file
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="aspect-[3/4] overflow-hidden rounded-lg border-2 border-slate-200 bg-slate-100">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- a local preview, not a page image
        <img src={src} alt="" className="size-full object-cover object-top" />
      )}
    </div>
  );
}

function Review({
  data,
  event,
  onBack,
  onSaved,
}: {
  data: AppData;
  event: EventDetails;
  onBack: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(event.name ?? "");
  const [division, setDivision] = useState(
    () => pickDivision(event.divisions, data.team.ageGroup) ?? event.divisions[0]?.name ?? "",
  );
  const teams: EventTeam[] = newTeams(
    [],
    event.divisions.find((d) => d.name === division)?.teams ?? [],
  );
  const [ours, setOurs] = useState<string | null>(() => guessOurTeam(teams, data.team.name));
  const [links, setLinks] = useState({ info: "", schedule: "", bracket: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!event.isEvent && event.divisions.length === 0 && !event.name) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-base">
          That doesn&apos;t look like a tournament.
          {event.warnings.length > 0 && ` ${event.warnings.join(" ")}`}
        </p>
        <button
          onClick={onBack}
          className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold"
        >
          Back to the screenshots
        </button>
      </div>
    );
  }

  const save = async () => {
    if (!name.trim()) {
      setError("Give the tournament a name.");
      return;
    }
    const checked = checkLinks(links);
    if (typeof checked === "string") {
      setError(checked);
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
        links: checked,
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
          "Dates not shown in the screenshot"}
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
                {d.name} ({d.teams.length} team{d.teams.length === 1 ? "" : "s"})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-base text-slate-700">
          No teams in this screenshot. Add them later from the Teams tab with another screenshot.
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

      <LinkFields value={links} onChange={setLinks} />

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

export interface LinkInputs {
  info: string;
  schedule: string;
  bracket: string;
}

const LINK_LABELS: { key: keyof LinkInputs; label: string }[] = [
  { key: "info", label: "Tournament info" },
  { key: "schedule", label: "Tournament schedule" },
  { key: "bracket", label: "Tournament bracket" },
];

/** The three links, checked; or what's wrong with one of them. */
export function checkLinks(v: LinkInputs): TournamentLinks | string {
  const out: Record<keyof LinkInputs, string | null> = {
    info: null,
    schedule: null,
    bracket: null,
  };
  for (const { key, label } of LINK_LABELS) {
    const link = tournamentLink(v[key]);
    if (link === "bad") return `${label}: paste a web link that starts with https://`;
    out[key] = link;
  }
  return { infoUrl: out.info, scheduleUrl: out.schedule, bracketUrl: out.bracket };
}

/** Links to the tournament's info, schedule and bracket pages; the whole team can open them. */
export function LinkFields({
  value,
  onChange,
}: {
  value: LinkInputs;
  onChange: (v: LinkInputs) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className={heading}>Links for the team</h3>
        <p className="text-sm text-slate-600">
          Optional. Paste them now or later; parents tap them in the app.
        </p>
      </div>
      {LINK_LABELS.map(({ key, label }) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="text-base font-semibold">{label}</span>
          <input
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={500}
            placeholder="https://"
            className={field}
          />
        </label>
      ))}
    </section>
  );
}

export function ScreenshotButton({
  onFiles,
  label,
  primary = false,
}: {
  onFiles: (f: File[]) => void;
  label: string;
  primary?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-center rounded-xl text-base font-bold ${primary ? "h-14 bg-[var(--team)] text-lg text-white active:bg-[var(--team-press)]" : "h-12 border-2 border-slate-400 bg-white active:bg-slate-100"}`}
    >
      {label}
      <input
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length) onFiles(picked);
        }}
      />
    </label>
  );
}
