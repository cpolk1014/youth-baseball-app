"use client";

// Pine Tar Productions: a parent turns a clip of their kid into a highlight with a name
// banner, an AI announcer call and a slow-motion replay. It's made on the phone and saved
// to the phone; RallyCap never stores the video.
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData } from "@/lib/data/types";
import type { Player } from "@/lib/rules/types";
import {
  callProblem,
  DEFAULT_CLIP_SECONDS,
  fallbackCall,
  markClip,
  MAX_CALL,
  MAX_CLIP_SECONDS,
  MAX_DETAIL,
  momentWindow,
  PLAYS,
  playOf,
  SLOW_LENGTHS,
  type PlayId,
} from "@/lib/highlights/plays";
import { MicField } from "../Dictate";
import { useToday } from "../useToday";
import { ReelPreview } from "./ReelPreview";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const primary =
  "flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40";
const secondary =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white text-base font-bold active:bg-slate-100 disabled:opacity-40";
const fieldCls =
  "w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 pr-14 text-lg focus:border-[var(--team)] focus:outline-none";

const secs = (n: number) => `${n.toFixed(1)} s`;
const markBtn =
  "flex h-14 flex-col items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-base leading-tight font-bold active:bg-slate-100 disabled:opacity-40";
const chip = (on: boolean) =>
  `h-11 rounded-full px-3 text-base font-semibold ${on ? "bg-[var(--team)] text-white" : "border-2 border-slate-300 bg-white"}`;

type Step = 1 | 2 | 3;
const STEPS: [Step, string][] = [
  [1, "Clip"],
  [2, "Play"],
  [3, "Preview"],
];

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
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  const [duration, setDuration] = useState(0);
  // Reading the clip's length from the file ("reading"), or why it can't be used.
  const [clipNote, setClipNote] = useState<string | null>(null);
  const [cut, setCut] = useState({ start: 0, end: DEFAULT_CLIP_SECONDS });
  // Where the video is paused in step 1, and the big moment the slow-mo centers on.
  const [now, setNow] = useState(0);
  const [moment, setMoment] = useState<number | null>(null);
  const [slowLen, setSlowLen] = useState<number>(SLOW_LENGTHS[1].seconds);
  const [play, setPlay] = useState<PlayId>("hit");
  const [gameChoice, setGameChoice] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [call, setCall] = useState(() => fallbackCall("hit", kid.name, kid.jerseyNumber ?? null));
  const [edited, setEdited] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [announcer, setAnnouncer] = useState(true);
  const [replay, setReplay] = useState(true);
  const trimVideo = useRef<HTMLVideoElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reel, setReel] = useState<Blob | null>(null);
  const reelUrl = useMemo(() => (reel ? URL.createObjectURL(reel) : null), [reel]);
  useEffect(() => () => void (reelUrl && URL.revokeObjectURL(reelUrl)), [reelUrl]);
  const today = useToday();

  // Recent and coming games, newest first, for the "vs" on the banner. It starts on the
  // latest game played (usually the one the clip is from).
  const games = [...data.games].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  const latestGame = today ? (games.find((g) => g.date <= today)?.id ?? "") : "";
  const gameId = gameChoice ?? latestGame;
  const opponent = games.find((g) => g.id === gameId)?.opponent ?? null;
  const { start, end } = cut;
  const len = end - start;
  const slow = momentWindow(start, end, moment ?? end, slowLen);
  const ready = !!file && duration > 0;
  const info = {
    kidName: kid.name,
    number: kid.jerseyNumber ?? null,
    teamName: data.team.name,
    colors: data.team.colors,
    play: playOf(play),
    opponent,
  };

  const pickFile = (f: File | null) => {
    setFile(f);
    setDuration(0);
    setCut({ start: 0, end: DEFAULT_CLIP_SECONDS });
    setMoment(null);
    setNow(0);
    setReel(null);
    setError(null);
    if (!f) return;
    setClipNote("reading");
    void import("@/lib/highlights/render")
      .then(({ readClip }) => readClip(f))
      .then((d) => {
        setDuration((was) => was || d);
        setCut({ start: 0, end: Math.min(d, DEFAULT_CLIP_SECONDS) });
        setClipNote(null);
      })
      .catch((err: unknown) => {
        console.error("clip read failed", err);
        setClipNote(
          err instanceof Error && err.message
            ? err.message
            : "Couldn't read that clip. Try a different one.",
        );
      });
  };

  const mark = (which: "start" | "end") => {
    const t = trimVideo.current?.currentTime ?? now;
    setCut((c) => markClip(duration, c, t, which));
  };
  const markMoment = () => {
    const t = trimVideo.current?.currentTime ?? now;
    setMoment(t);
    // The big moment has to be in the cut: stretch the cut to reach it.
    if (t < start) setCut((c) => markClip(duration, c, t, "start"));
    else if (t > end) setCut((c) => markClip(duration, c, t, "end"));
  };
  const seek = (t: number) => {
    const v = trimVideo.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.min(Math.max(t, 0), duration);
    setNow(v.currentTime);
  };
  /** Plays just the cut in the step 1 player. */
  const playCut = () => {
    const v = trimVideo.current;
    if (!v) return;
    v.currentTime = start;
    const stopAtEnd = () => {
      if (v.currentTime >= end) {
        v.pause();
        v.removeEventListener("timeupdate", stopAtEnd);
      }
    };
    v.addEventListener("timeupdate", stopAtEnd);
    void v.play();
  };

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

  const goTo = (s: Step) => {
    setError(null);
    if (s === 3 && announcer) {
      const problem = callProblem(call);
      if (problem) {
        setStep(2);
        setError(problem);
        return;
      }
    }
    setStep(s);
    trimVideo.current?.pause();
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
        ...info,
        file,
        start,
        end,
        voice,
        replay,
        replayPick: slow,
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
        <button
          onClick={() => {
            setReel(null);
            setStep(3);
          }}
          className={secondary}
        >
          Change something
        </button>
        <button
          onClick={() => {
            setReel(null);
            pickFile(null);
            setStep(1);
            setOptions([]);
            setEdited(false);
            setDetail("");
            setGameChoice(null);
          }}
          className={secondary}
        >
          Make another
        </button>
      </div>
    );
  }

  const pct = (t: number) => `${(duration ? (t / duration) * 100 : 0).toFixed(2)}%`;

  return (
    <div className="flex flex-col gap-5">
      <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
        {STEPS.map(([n, label]) => {
          const here = n === step;
          const canGo = !busy && (n < step || (ready && n !== step));
          return (
            <li key={n}>
              <button
                type="button"
                disabled={!canGo && !here}
                aria-current={here ? "step" : undefined}
                onClick={() => canGo && goTo(n)}
                className={`flex h-11 w-full items-center justify-center gap-1.5 rounded-full text-base font-bold ${
                  here
                    ? "bg-[var(--team)] text-white"
                    : n < step
                      ? "bg-slate-200 text-slate-800"
                      : "border-2 border-slate-200 text-slate-500"
                }`}
              >
                <span aria-hidden="true">{n < step ? "✓" : n}</span> {label}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <section className="flex flex-col gap-3">
          {!file ? (
            <>
              <p className="text-base text-slate-700">
                Lights, camera, pine tar. Pick a clip of {kid.name} and get a highlight with their
                name on the screen, a stadium announcer and a slow-mo replay. It&apos;s made right
                here on your phone, and only you have it.
              </p>
              <label className={primary}>
                🎥 Pick a clip from your phone
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={(e) => {
                    pickFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          ) : (
            <>
              <video
                ref={trimVideo}
                key={url}
                // "#t" shows the first frame instead of black (iPhone loads nothing until it plays).
                src={url ? `${url}#t=0.001` : undefined}
                controls
                playsInline
                muted
                preload="metadata"
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                onSeeked={(e) => setNow(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  // A backup for browsers that do load it; the file read is the main way.
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0) setDuration((was) => was || d);
                }}
                className="max-h-72 w-full rounded-xl bg-black"
              />
              {ready ? (
                <>
                  <p className="text-base text-slate-700">
                    Play or scrub to a spot, pause, then tap. Up to {MAX_CLIP_SECONDS} seconds.
                  </p>
                  {/* The whole clip, with the cut, the big moment and where it's paused. */}
                  <div
                    className="relative h-10 w-full cursor-pointer touch-none overflow-hidden rounded-lg bg-slate-200"
                    onPointerDown={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      seek(((e.clientX - r.left) / r.width) * duration);
                    }}
                    role="presentation"
                  >
                    <div
                      className="absolute inset-y-0 bg-[var(--team)] opacity-80"
                      style={{ left: pct(start), width: pct(len) }}
                    />
                    {moment !== null && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl"
                        style={{ left: pct(moment) }}
                      >
                        ⭐
                      </span>
                    )}
                    <div
                      className="absolute inset-y-0 w-0.5 bg-slate-900"
                      style={{ left: pct(now) }}
                    />
                  </div>
                  <p className="text-base font-semibold" aria-live="polite">
                    Your cut: {secs(start)} to {secs(end)} ({secs(len)})
                    {moment !== null && <> · ⭐ at {secs(moment)}</>}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => mark("start")} className={markBtn}>
                      <span aria-hidden="true">⏮</span> Start here
                    </button>
                    <button type="button" onClick={markMoment} className={markBtn}>
                      <span aria-hidden="true">⭐</span> Big moment
                    </button>
                    <button type="button" onClick={() => mark("end")} className={markBtn}>
                      <span aria-hidden="true">⏭</span> End here
                    </button>
                  </div>
                  <p className="text-sm text-slate-600">
                    The big moment (the swing, the catch, the slide) is what the slow-mo replays. No
                    star? It replays the end of the cut.
                  </p>
                  <button type="button" onClick={playCut} className={secondary}>
                    ▶️ Play my cut
                  </button>
                </>
              ) : (
                <p aria-live="polite" className="text-base font-semibold text-slate-700">
                  {clipNote === "reading" || clipNote === null ? "Reading your clip…" : clipNote}
                </p>
              )}
              <label className="cursor-pointer text-center text-base font-semibold text-[var(--team-text,var(--team))] underline underline-offset-4">
                Pick a different clip
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={(e) => {
                    pickFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className={heading}>What happened?</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="What happened">
              {PLAYS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={play === p.id}
                  onClick={() => pickPlay(p.id)}
                  className={chip(play === p.id)}
                >
                  <span aria-hidden="true">{p.icon}</span> {p.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className={heading}>Which game</span>
            <select
              value={gameId}
              onChange={(e) => setGameChoice(e.target.value)}
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
          <div>
            <h2 className={heading}>The announcer</h2>
            <label className="flex items-center gap-3 text-base">
              <input
                type="checkbox"
                checked={announcer}
                onChange={(e) => setAnnouncer(e.target.checked)}
                className="size-6 accent-[var(--team)]"
              />
              Stadium announcer calls the play
            </label>
          </div>
          {announcer && (
            <div className="flex flex-col gap-3">
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
              <details className="rounded-xl bg-slate-50 p-3" open={options.length > 0}>
                <summary className="cursor-pointer text-base font-bold">
                  ✨ Have AI write it
                </summary>
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
                    ✨{" "}
                    {busy === "Writing the call…"
                      ? busy
                      : options.length
                        ? "Write 3 more"
                        : "Write 3 calls"}
                  </button>
                  {options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => {
                        setCall(o);
                        setEdited(true);
                      }}
                      className={`rounded-xl border-2 p-3 text-left text-base ${call === o ? "border-[var(--team)] bg-white" : "border-slate-200 bg-white"}`}
                    >
                      {call === o && <span className="sr-only">Chosen: </span>}“{o}”
                    </button>
                  ))}
                </div>
              </details>
            </div>
          )}
        </section>
      )}

      {step === 3 && url && (
        <section className="flex flex-col gap-4">
          <ReelPreview url={url} start={start} end={end} replay={replay} slow={slow} info={info} />
          <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
            <label className="flex items-center gap-3 text-base font-semibold">
              <input
                type="checkbox"
                checked={replay}
                onChange={(e) => setReplay(e.target.checked)}
                className="size-6 accent-[var(--team)]"
              />
              Slow-motion replay at the end
            </label>
            {replay && (
              <>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Slow-mo length">
                  {SLOW_LENGTHS.map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      aria-pressed={slowLen === o.seconds}
                      onClick={() => setSlowLen(o.seconds)}
                      className={chip(slowLen === o.seconds)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-slate-600">
                  {moment === null
                    ? "Replays the end of the cut. "
                    : `Replays ${secs(slow.to - slow.from)} around your ⭐. `}
                  <button
                    type="button"
                    onClick={() => goTo(1)}
                    className="font-semibold underline underline-offset-4"
                  >
                    {moment === null ? "Mark the big moment" : "Move the ⭐"}
                  </button>
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      {busy && busy !== "Writing the call…" && (
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

      {file && (
        <div className="flex gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={() => goTo((step - 1) as Step)}
              disabled={!!busy}
              className="flex h-14 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-5 text-base font-bold active:bg-slate-100 disabled:opacity-40"
            >
              ← Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={() => goTo((step + 1) as Step)}
              disabled={!ready || !!busy}
              className={primary}
            >
              {step === 1 ? "Next: the play →" : "Next: preview →"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void roll()}
              disabled={!ready || !!busy}
              className={primary}
            >
              🎬 Make my video
            </button>
          )}
        </div>
      )}
      {step === 3 && (
        <p className="text-sm text-slate-600">
          Keep this screen open while it&apos;s made (about as long as the video). Your clip never
          leaves your phone; only the announcer&apos;s words go to the AI.
        </p>
      )}
    </div>
  );
}
