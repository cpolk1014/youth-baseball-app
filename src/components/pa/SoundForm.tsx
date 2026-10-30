"use client";

import { useState } from "react";
import { defaultClip, type ClipRange } from "@/lib/pa/clip";
import { CATEGORY_LABEL, type SoundCategory, type TeamSound } from "@/lib/pa/types";
import { decode, playBuffer, renderClip, stopAll } from "./engine";
import { generate } from "./paData";
import { Trimmer } from "./Trimmer";

const field =
  "h-12 w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const primary =
  "h-14 w-full rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-50";
const secondary =
  "h-12 w-full rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100 disabled:opacity-50";

/** Add a sound to the team's soundboard: describe it for the AI, or upload and trim one. */
export function SoundForm({
  teamId,
  signedIn,
  initialCategory,
  onAdd,
  onDone,
}: {
  teamId: string;
  signedIn: boolean;
  initialCategory: SoundCategory;
  onAdd: (s: Omit<TeamSound, "id" | "path">, file: Blob) => Promise<void>;
  onDone: () => void;
}) {
  const [how, setHow] = useState<"ai" | "upload">(signedIn ? "ai" : "upload");
  const [category, setCategory] = useState<SoundCategory>(initialCategory);
  const [label, setLabel] = useState("");
  const [describe, setDescribe] = useState("");
  const [seconds, setSeconds] = useState(3);
  const [made, setMade] = useState<{ blob: Blob; buffer: AudioBuffer } | null>(null);
  const [upload, setUpload] = useState<AudioBuffer | null>(null);
  const [range, setRange] = useState<ClipRange>({ start: 0, end: 10 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const ready = how === "ai" ? made !== null : upload !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {(["ai", "upload"] as const).map((h) => (
          <button
            key={h}
            aria-pressed={how === h}
            onClick={() => setHow(h)}
            className={`h-12 rounded-xl text-base font-bold ${
              how === h ? "bg-[var(--team)] text-white" : "border-2 border-slate-300 bg-white"
            }`}
          >
            {h === "ai" ? "✨ Make with AI" : "📁 Upload"}
          </button>
        ))}
      </div>

      {how === "ai" &&
        (signedIn ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">Describe the sound</span>
              <input
                value={describe}
                maxLength={120}
                onChange={(e) => setDescribe(e.target.value)}
                placeholder="Cartoon slide whistle going down, then a crash"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">About {seconds} seconds</span>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                className="h-10 w-full accent-[var(--team)]"
              />
            </label>
            <button
              disabled={!!busy || !describe.trim()}
              onClick={() =>
                run("Making the sound…", async () => {
                  const blob = await generate("sound", { teamId, text: describe, seconds });
                  const buffer = await decode(await blob.arrayBuffer());
                  setMade({ blob, buffer });
                  if (!label.trim()) setLabel(describe.trim().slice(0, 40));
                  playBuffer("new-sound", buffer);
                })
              }
              className={secondary}
            >
              {made ? "✨ Make it again" : "✨ Make the sound"}
            </button>
            {made && (
              <button onClick={() => playBuffer("new-sound", made.buffer)} className={secondary}>
                ▶ Play it
              </button>
            )}
          </>
        ) : (
          <p className="text-base">AI sounds need sign-in. You can upload one instead.</p>
        ))}

      {how === "upload" && (
        <>
          <label className="flex flex-col gap-2">
            <span className="text-base">Pick an audio file (MP3, M4A or WAV).</span>
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.aac"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                void run("Reading the file…", async () => {
                  try {
                    const b = await decode(await f.arrayBuffer());
                    setUpload(b);
                    setRange(defaultClip(b.duration));
                    if (!label.trim()) setLabel(f.name.replace(/\.[^.]+$/, "").slice(0, 40));
                  } catch {
                    throw new Error("Couldn't read that file. Copy-protected songs won't work.");
                  }
                });
              }}
              className="text-base file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-slate-200 file:px-4 file:font-bold"
            />
          </label>
          {upload && (
            <>
              <Trimmer song={upload} range={range} onChange={setRange} />
              <button
                onClick={() =>
                  run("Cutting the clip…", async () => {
                    const r = await renderClip(upload, range, { fadeIn: false, fadeOut: true });
                    playBuffer("new-sound", r.buffer);
                  })
                }
                className={secondary}
              >
                ▶ Play the clip
              </button>
            </>
          )}
        </>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Button name</span>
        <input
          value={label}
          maxLength={40}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Foul ball!"
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Where it goes</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as SoundCategory)}
          className={field}
        >
          {(Object.keys(CATEGORY_LABEL) as SoundCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>

      {busy && (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-3 text-base font-semibold text-amber-900"
        >
          {busy}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <button
        disabled={!!busy || !ready || !label.trim()}
        onClick={() =>
          run("Saving…", async () => {
            stopAll();
            const file =
              how === "ai"
                ? made!.blob
                : (await renderClip(upload!, range, { fadeIn: false, fadeOut: true })).wav;
            await onAdd({ category, label: label.trim(), source: how }, file);
            onDone();
          })
        }
        className={primary}
      >
        Add to the soundboard
      </button>
    </div>
  );
}
