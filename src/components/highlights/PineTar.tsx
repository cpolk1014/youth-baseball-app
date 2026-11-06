"use client";

// Pine Tar Productions: a parent turns a clip of their kid into a highlight with a name
// banner, an AI announcer call and a slow-motion replay. It's made on the phone and saved
// to the phone; RallyCap never stores the video.
import { useEffect, useMemo, useState } from "react";
import type { AppData } from "@/lib/data/types";
import type { Player } from "@/lib/rules/types";
import {
  callProblem,
  fallbackCall,
  MAX_CALL,
  MAX_CLIP_SECONDS,
  MAX_DETAIL,
  PLAYS,
  playOf,
  type PlayId,
} from "@/lib/highlights/plays";
import { MicField } from "../Dictate";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const primary =
  "flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40";
const secondary =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white text-base font-bold active:bg-slate-100 disabled:opacity-40";
const fieldCls =
  "w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 pr-14 text-lg focus:border-[var(--team)] focus:outline-none";

const secs = (n: number) => `${n.toFixed(1)} s`;

async function postCall(body: Record<string, unknown>) {
  const res = await fetch("/api/highlights/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? "Something went wrong. Try again.");
  }
  return res;
}

export function PineTar({ data, kid }: { data: AppData; kid: Player }) {
  const [file, setFile] = useState<File | null>(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [length, setLength] = useState(8);
  const [play, setPlay] = useState<PlayId>("hit");
  const [gameId, setGameId] = useState("");
  const [detail, setDetail] = useState("");
  const [call, setCall] = useState(() => fallbackCall("hit", kid.name, kid.jerseyNumber ?? null));
  const [edited, setEdited] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [announcer, setAnnouncer] = useState(true);
  const [replay, setReplay] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reel, setReel] = useState<Blob | null>(null);
  const reelUrl = useMemo(() => (reel ? URL.createObjectURL(reel) : null), [reel]);
  useEffect(() => () => void (reelUrl && URL.revokeObjectURL(reelUrl)), [reelUrl]);

  // Recent and coming games, newest first, for the "vs" on the banner.
  const games = [...data.games].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  const opponent = games.find((g) => g.id === gameId)?.opponent ?? null;
  const len = Math.min(length, Math.max(1, duration - start), MAX_CLIP_SECONDS);
  const end = start + len;

  const pickPlay = (id: PlayId) => {
    setPlay(id);
    setOptions([]);
    if (!edited) setCall(fallbackCall(id, kid.name, kid.jerseyNumber ?? null));
  };

  const writeCall = async () => {
    setBusy("Writing the call…");
    setError(null);
    try {
      const res = await postCall({ action: "write", playerId: kid.id, play, detail });
      const body = (await res.json()) as { calls: string[] };
      setOptions(body.calls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't write the call.");
    } finally {
      setBusy(null);
    }
  };

  const roll = async () => {
    if (!file) return;
    const problem = announcer ? callProblem(call) : null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setReel(null);
    setProgress(0);
    try {
      let voice: ArrayBuffer | null = null;
      if (announcer) {
        setBusy("The announcer is warming up…");
        const res = await postCall({ action: "voice", playerId: kid.id, script: call });
        voice = await res.arrayBuffer();
      }
      setBusy("Rolling film…");
      const { renderReel } = await import("@/lib/highlights/render");
      const blob = await renderReel({
        file,
        start,
        end,
        kidName: kid.name,
        number: kid.jerseyNumber ?? null,
        teamName: data.team.name,
        colors: data.team.colors,
        play: playOf(play),
        opponent,
        voice,
        replay,
        onProgress: setProgress,
      });
      setReel(blob);
    } catch (e) {
      console.error("reel failed", e);
      setError(e instanceof Error ? e.message : "The video didn't finish. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const fileName = `${kid.name.replace(/[^a-z0-9]+/gi, "-")}-${playOf(play).id}.mp4`;
  const save = async () => {
    if (!reel) return;
    const f = new File([reel], fileName, { type: "video/mp4" });
    if (navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f], title: `${kid.name}: ${playOf(play).label}` });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    const a = document.createElement("a");
    a.href = reelUrl!;
    a.download = fileName;
    a.click();
  };

  if (reel && reelUrl) {
    return (
      <div className="flex flex-col gap-4">
        <video
          src={reelUrl}
          controls
          playsInline
          autoPlay
          className="max-h-[60vh] w-full rounded-xl bg-black object-contain"
          aria-label={`${kid.name}'s highlight`}
        />
        <button onClick={() => void save()} className={primary}>
          ⬇️ Save to my phone
        </button>
        <p className="text-sm text-slate-600">
          RallyCap doesn&apos;t keep your video. Save it now: it&apos;s gone when you close this. On
          iPhone, tap Save Video in the share menu.
        </p>
        <button onClick={() => setReel(null)} className={secondary}>
          Change something
        </button>
        <button
          onClick={() => {
            setReel(null);
            setFile(null);
            setOptions([]);
            setEdited(false);
            setDetail("");
          }}
          className={secondary}
        >
          Make another
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-base text-slate-700">
        Lights, camera, pine tar. Pick a clip of {kid.name}, tag the play, and get a highlight with
        their name on the screen, a stadium announcer and a slow-mo replay. It&apos;s made right
        here on your phone, and only you have it.
      </p>

      <section>
        <h2 className={heading}>1. The clip</h2>
        <label className={secondary}>
          🎥 {file ? "Pick a different clip" : "Pick a clip from your phone"}
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setStart(0);
              setDuration(0);
              setReel(null);
              e.target.value = "";
            }}
          />
        </label>
        {url && (
          <div className="mt-3 flex flex-col gap-3">
            <video
              key={url}
              src={`${url}#t=${start.toFixed(2)},${end.toFixed(2)}`}
              controls
              playsInline
              muted
              preload="metadata"
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d)) {
                  setDuration(d);
                  setLength(Math.min(8, d));
                }
              }}
              className="max-h-72 w-full rounded-xl bg-black"
            />
            {duration > 0 && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-base font-semibold">
                    Starts at {secs(start)} (of {secs(duration)})
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, duration - 1)}
                    step={0.1}
                    value={start}
                    onChange={(e) => setStart(Number(e.target.value))}
                    className="h-11 w-full accent-[var(--team)]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-base font-semibold">Plays for {secs(len)}</span>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, Math.min(MAX_CLIP_SECONDS, duration - start))}
                    step={0.1}
                    value={len}
                    onChange={(e) => setLength(Number(e.target.value))}
                    className="h-11 w-full accent-[var(--team)]"
                  />
                </label>
                <p className="text-sm text-slate-600">
                  Up to {MAX_CLIP_SECONDS} seconds. End it right after the big moment: the replay
                  shows the last few seconds again.
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className={heading}>2. The play</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="What happened">
          {PLAYS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={play === p.id}
              onClick={() => pickPlay(p.id)}
              className={`h-11 rounded-full px-3 text-base font-semibold ${
                play === p.id ? "bg-[var(--team)] text-white" : "border-2 border-slate-300 bg-white"
              }`}
            >
              <span aria-hidden="true">{p.icon}</span> {p.label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-base font-semibold">Which game (optional)</span>
          <select
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
          >
            <option value="">No opponent on the banner</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                vs {g.opponent} ·{" "}
                {new Date(`${g.date}T12:00`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h2 className={heading}>3. The call</h2>
        <label className="flex items-center gap-3 text-base">
          <input
            type="checkbox"
            checked={announcer}
            onChange={(e) => setAnnouncer(e.target.checked)}
            className="size-6 accent-[var(--team)]"
          />
          Stadium announcer calls the play
        </label>
        {announcer && (
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                What happened? (optional, helps the AI)
              </span>
              <MicField value={detail} maxLength={MAX_DETAIL} onChange={setDetail}>
                <input
                  value={detail}
                  maxLength={MAX_DETAIL}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="Two strikes, ripped it down the third base line"
                  className={`${fieldCls} h-12`}
                />
              </MicField>
            </label>
            <button
              type="button"
              onClick={() => void writeCall()}
              disabled={!!busy}
              className={secondary}
            >
              ✨ {options.length ? "Write 3 more" : "Write the call with AI"}
            </button>
            {options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  setCall(o);
                  setEdited(true);
                }}
                className={`rounded-xl border-2 p-3 text-left text-base ${call === o ? "border-[var(--team)] bg-slate-50" : "border-slate-200 bg-white"}`}
              >
                “{o}”
              </button>
            ))}
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">The announcer says</span>
              <MicField
                multiline
                value={call}
                maxLength={MAX_CALL}
                onChange={(v) => {
                  setCall(v);
                  setEdited(true);
                }}
              >
                <textarea
                  value={call}
                  rows={3}
                  maxLength={MAX_CALL}
                  onChange={(e) => {
                    setCall(e.target.value);
                    setEdited(true);
                  }}
                  className={fieldCls}
                />
              </MicField>
              <span className="text-sm text-slate-600">
                Tip: &quot;...&quot; makes a dramatic pause, CAPS get extra hype.
              </span>
            </label>
          </div>
        )}
        <label className="mt-3 flex items-center gap-3 text-base">
          <input
            type="checkbox"
            checked={replay}
            onChange={(e) => setReplay(e.target.checked)}
            className="size-6 accent-[var(--team)]"
          />
          Slow-motion replay at the end
        </label>
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      {busy && (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="text-base font-semibold">{busy}</p>
          {busy === "Rolling film…" && (
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-[var(--team)] transition-[width]"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => void roll()}
        disabled={!file || duration === 0 || !!busy}
        className={primary}
      >
        🎬 Roll the highlight
      </button>
      <p className="text-sm text-slate-600">
        Keep this screen open while it&apos;s made (about as long as the video). Your clip never
        leaves your phone; only the announcer&apos;s words go to the AI.
      </p>
    </div>
  );
}
