"use client";

import { useEffect, useState } from "react";
import { defaultClip, type ClipRange } from "@/lib/pa/clip";
import { SONG_STYLES, MAX_VIBE, type SongStyle } from "@/lib/pa/songPrompt";
import {
  announcement,
  DEFAULT_SCRIPT,
  MAX_SPOKEN,
  MAX_SCRIPT,
  numberWords,
  scriptProblem,
  type CallInput,
} from "@/lib/pa/speech";
import type { AnnounceMode, Walkup } from "@/lib/pa/types";
import type { Player } from "@/lib/rules/types";
import { loadBuffer } from "./buffers";
import { decode, playBuffer, playWalkup, renderClip, stopAll } from "./engine";
import { generate, walkupPath } from "./paData";
import { Trimmer } from "./Trimmer";
import { usePlaying } from "./usePlaying";

const field =
  "h-12 w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const primary =
  "h-14 w-full rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-50";
const secondary =
  "h-12 w-full rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100 disabled:opacity-50";

interface NewSong {
  source: AudioBuffer;
  kind: "ai" | "upload";
  prompt: string | null;
}

/** Set up a kid's walk-up: the song (AI or upload, trimmed), the announcer, and a preview. */
export function WalkupEditor({
  teamId,
  player,
  existing,
  isCoach,
  signedIn,
  onSave,
  onRemove,
  onDone,
}: {
  teamId: string;
  player: Player;
  existing: Walkup | null;
  isCoach: boolean;
  signedIn: boolean;
  onSave: (
    w: Walkup,
    files: { song?: Blob; announce?: Blob },
    replaced: Walkup | null,
  ) => Promise<void>;
  onRemove: (w: Walkup) => Promise<void>;
  onDone: () => void;
}) {
  const [song, setSong] = useState<NewSong | null>(null);
  const [range, setRange] = useState<ClipRange>({ start: 0, end: 15 });
  const [fadeIn, setFadeIn] = useState(true);
  const [fadeOut, setFadeOut] = useState(true);
  const [savedClip, setSavedClip] = useState<AudioBuffer | null>(null);
  const [picking, setPicking] = useState<"ai" | "upload" | null>(existing ? null : "ai");

  const [style, setStyle] = useState<SongStyle>("rock");
  const [vibe, setVibe] = useState("");
  const [singName, setSingName] = useState(true);

  const [announce, setAnnounce] = useState(existing?.announce ?? signedIn);
  const [mode, setMode] = useState<AnnounceMode>(existing?.announceMode ?? "over");
  const [nameSpoken, setNameSpoken] = useState(existing?.nameSpoken ?? "");
  const [numberSpoken, setNumberSpoken] = useState(existing?.numberSpoken ?? "");
  const [script, setScript] = useState(existing?.script ?? "");
  const [volume, setVolume] = useState(existing?.volume ?? 1);
  // The announcer call we have, and the words it says.
  const [call, setCall] = useState<{ blob: Blob | null; buffer: AudioBuffer; text: string } | null>(
    null,
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playing = usePlaying();

  const callInput: CallInput = {
    rosterName: player.name,
    jerseyNumber: player.jerseyNumber,
    nameSpoken,
    numberSpoken,
    script,
  };
  const words = announcement(callInput);
  const scriptError = scriptProblem(script);
  const callIsCurrent = call?.text === words;

  // Load what's saved, so it can be previewed and kept.
  useEffect(() => {
    if (!existing) return;
    let current = true;
    loadBuffer(existing.songPath).then(
      (b) => current && setSavedClip(b),
      () => current && setError("Couldn't load the saved song. Check your signal."),
    );
    if (existing.announcePath) {
      const text = announcement({
        rosterName: player.name,
        jerseyNumber: player.jerseyNumber,
        nameSpoken: existing.nameSpoken,
        numberSpoken: existing.numberSpoken,
        script: existing.script,
      });
      loadBuffer(existing.announcePath).then(
        (buffer) => current && setCall({ blob: null, buffer, text }),
        () => undefined,
      );
    }
    return () => {
      current = false;
      stopAll();
    };
  }, [existing, player.name, player.jerseyNumber]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const takeSong = (source: AudioBuffer, kind: "ai" | "upload", prompt: string | null) => {
    setSong({ source, kind, prompt });
    setRange(defaultClip(source.duration));
    setPicking(null);
  };

  const makeSong = () =>
    run("Making your song… this takes about 30 seconds", async () => {
      const blob = await generate("song", {
        teamId,
        playerId: player.id,
        style,
        vibe,
        singName,
        nameSpoken,
        numberSpoken,
      });
      const label = SONG_STYLES.find((s) => s.id === style)!.label;
      takeSong(
        await decode(await blob.arrayBuffer()),
        "ai",
        vibe.trim() ? `${label}: ${vibe.trim()}` : label,
      );
    });

  const upload = (file: File) =>
    run("Reading the song…", async () => {
      let buffer: AudioBuffer;
      try {
        buffer = await decode(await file.arrayBuffer());
      } catch {
        throw new Error(
          "Couldn't read that file. Songs from Apple Music or Spotify are copy-protected; use a purchased MP3 or M4A.",
        );
      }
      takeSong(buffer, "upload", null);
    });

  /** The announcer call for the current words (made now if the words changed). */
  const ensureCall = async () => {
    if (callIsCurrent) return call;
    const blob = await generate("announce", {
      teamId,
      playerId: player.id,
      nameSpoken,
      numberSpoken,
      script,
    });
    const made = { blob, buffer: await decode(await blob.arrayBuffer()), text: words };
    setCall(made);
    return made;
  };

  const clip = async () =>
    song ? await renderClip(song.source, range, { fadeIn, fadeOut }) : null;

  const preview = () =>
    run("Getting the preview ready…", async () => {
      const rendered = await clip();
      const songBuffer = rendered?.buffer ?? savedClip;
      if (!songBuffer) throw new Error("Pick a song first.");
      const c = announce && signedIn && !scriptError ? await ensureCall() : null;
      playWalkup("preview", songBuffer, c?.buffer ?? null, { mode, volume });
    });

  const save = () =>
    run("Saving…", async () => {
      if (scriptError) throw new Error(scriptError);
      const rendered = await clip();
      if (!rendered && !existing) throw new Error("Pick a song first.");
      const c = announce && signedIn ? await ensureCall() : null;
      const newCall = c && (c.blob !== null || !existing?.announcePath);
      const w: Walkup = {
        playerId: player.id,
        songPath: rendered ? walkupPath(teamId, player.id, "song", "wav") : existing!.songPath,
        songSource: song?.kind ?? existing!.songSource,
        songPrompt: song ? song.prompt : existing!.songPrompt,
        volume,
        announce: !!c,
        announceMode: mode,
        nameSpoken: nameSpoken.trim(),
        numberSpoken: numberSpoken.trim(),
        script: script.trim(),
        announcePath: c
          ? newCall
            ? walkupPath(teamId, player.id, "announce", "mp3")
            : existing!.announcePath
          : null,
        status: isCoach ? "approved" : "pending",
        updatedAt: "",
      };
      stopAll();
      await onSave(
        w,
        { song: rendered?.wav, announce: newCall && c?.blob ? c.blob : undefined },
        existing,
      );
      onDone();
    });

  const songReady = song !== null || savedClip !== null;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Song ── */}
      <section>
        <h3 className={heading}>Song</h3>
        {song || (existing && !picking) ? (
          <div className="mb-3 flex items-center gap-3 rounded-xl border-2 border-slate-200 p-3">
            <span aria-hidden="true" className="text-2xl">
              🎵
            </span>
            <p className="min-w-0 flex-1 text-base">
              {song
                ? song.kind === "ai"
                  ? `New AI song${song.prompt ? ` (${song.prompt})` : ""}`
                  : "New song from your file"
                : existing?.songSource === "ai"
                  ? `Saved AI song${existing.songPrompt ? ` (${existing.songPrompt})` : ""}`
                  : "Saved song"}
            </p>
            <button
              onClick={() => setPicking("ai")}
              className="h-11 shrink-0 rounded-lg border-2 border-slate-400 px-3 text-base font-bold active:bg-slate-100"
            >
              Change
            </button>
          </div>
        ) : null}

        {picking && (
          <div className="mb-3 flex flex-col gap-3 rounded-xl border-2 border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-2" role="tablist">
              {(["ai", "upload"] as const).map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={picking === p}
                  onClick={() => setPicking(p)}
                  className={`h-12 rounded-xl text-base font-bold ${
                    picking === p
                      ? "bg-[var(--team)] text-white"
                      : "border-2 border-slate-300 bg-white"
                  }`}
                >
                  {p === "ai" ? "✨ Make one with AI" : "📁 Upload a song"}
                </button>
              ))}
            </div>

            {picking === "ai" &&
              (signedIn ? (
                <>
                  <fieldset>
                    <legend className="mb-2 text-base font-semibold">Style</legend>
                    <div className="flex flex-wrap gap-2">
                      {SONG_STYLES.map((s) => (
                        <button
                          key={s.id}
                          aria-pressed={style === s.id}
                          onClick={() => setStyle(s.id)}
                          className={`h-11 rounded-full px-4 text-base font-semibold ${
                            style === s.id
                              ? "bg-[var(--team)] text-white"
                              : "border-2 border-slate-300 bg-white"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="flex flex-col gap-1">
                    <span className="text-base font-semibold">Describe the vibe (optional)</span>
                    <input
                      value={vibe}
                      maxLength={MAX_VIBE}
                      onChange={(e) => setVibe(e.target.value)}
                      placeholder="Slow dramatic build, then it explodes"
                      className={field}
                    />
                    <span className="text-sm text-slate-600">
                      Describe the sound, not a real song or artist.
                    </span>
                  </label>
                  <label className="flex items-center gap-3 text-base">
                    <input
                      type="checkbox"
                      checked={singName}
                      onChange={(e) => setSingName(e.target.checked)}
                      className="size-6 accent-[var(--team)]"
                    />
                    Chant {player.name.split(" ")[0]}&apos;s name and number in the song
                  </label>
                  <button onClick={makeSong} disabled={!!busy} className={primary}>
                    ✨ Make the song
                  </button>
                </>
              ) : (
                <p className="text-base">AI songs need sign-in. You can upload a song instead.</p>
              ))}

            {picking === "upload" && (
              <label className="flex flex-col gap-2">
                <span className="text-base">
                  Pick a song file (MP3, M4A or WAV). You&apos;ll choose the part to play next.
                </span>
                <input
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.aac"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                  className="text-base file:mr-3 file:h-11 file:rounded-lg file:border-0 file:bg-slate-200 file:px-4 file:font-bold"
                />
              </label>
            )}
            {existing && (
              <button
                onClick={() => setPicking(null)}
                className="text-base font-semibold underline"
              >
                Keep the saved song
              </button>
            )}
          </div>
        )}

        {song && (
          <div className="flex flex-col gap-3">
            <Trimmer song={song.source} range={range} onChange={setRange} />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-base">
                <input
                  type="checkbox"
                  checked={fadeIn}
                  onChange={(e) => setFadeIn(e.target.checked)}
                  className="size-6 accent-[var(--team)]"
                />
                Fade in
              </label>
              <label className="flex items-center gap-2 text-base">
                <input
                  type="checkbox"
                  checked={fadeOut}
                  onChange={(e) => setFadeOut(e.target.checked)}
                  className="size-6 accent-[var(--team)]"
                />
                Fade out
              </label>
            </div>
            <button
              onClick={() =>
                run("Cutting the clip…", async () => {
                  const r = await clip();
                  if (r) playBuffer("slice", r.buffer, volume);
                })
              }
              disabled={!!busy}
              className={secondary}
            >
              {playing === "slice" ? "Playing the clip…" : "▶ Play just the song clip"}
            </button>
          </div>
        )}
      </section>

      {/* ── Announcer ── */}
      <section className="flex flex-col gap-3">
        <h3 className={heading}>Announcer</h3>
        {signedIn ? (
          <>
            <label className="flex items-center gap-3 text-base">
              <input
                type="checkbox"
                checked={announce}
                onChange={(e) => setAnnounce(e.target.checked)}
                className="size-6 accent-[var(--team)]"
              />
              Announce {player.name.split(" ")[0]} before the song
            </label>
            {announce && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-base font-semibold">Say the name like</span>
                  <input
                    value={nameSpoken}
                    maxLength={MAX_SPOKEN}
                    onChange={(e) => setNameSpoken(e.target.value)}
                    placeholder={player.name}
                    className={field}
                  />
                  <span className="text-sm text-slate-600">
                    Spell it how it sounds, e.g. &quot;Jake Pohlk&quot; or &quot;Nee-ko&quot;.
                  </span>
                </label>
                {player.jerseyNumber != null && (
                  <label className="flex flex-col gap-1">
                    <span className="text-base font-semibold">
                      Say number {player.jerseyNumber} like
                    </span>
                    <input
                      value={numberSpoken}
                      maxLength={MAX_SPOKEN}
                      onChange={(e) => setNumberSpoken(e.target.value)}
                      placeholder={numberWords(player.jerseyNumber)}
                      className={field}
                    />
                    <span className="text-sm text-slate-600">
                      e.g. &quot;six seven&quot; instead of &quot;sixty-seven&quot;, or &quot;double
                      oh&quot;.
                    </span>
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-base font-semibold">What the announcer says</span>
                  <input
                    value={script}
                    maxLength={MAX_SCRIPT}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder={DEFAULT_SCRIPT}
                    className={field}
                  />
                  {scriptError ? (
                    <span className="text-sm font-semibold text-red-700">{scriptError}</span>
                  ) : (
                    <span className="text-sm text-slate-600">Says: &quot;{words}&quot;</span>
                  )}
                </label>
                <fieldset>
                  <legend className="mb-2 text-base font-semibold">When</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["over", "Over the intro"],
                        ["before", "Before the song"],
                      ] as const
                    ).map(([m, label]) => (
                      <button
                        key={m}
                        aria-pressed={mode === m}
                        onClick={() => setMode(m)}
                        className={`h-12 rounded-xl text-base font-bold ${
                          mode === m
                            ? "bg-[var(--team)] text-white"
                            : "border-2 border-slate-300 bg-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button
                  onClick={() =>
                    run("Recording the announcer…", async () => {
                      if (scriptError) throw new Error(scriptError);
                      const c = await ensureCall();
                      if (c) playBuffer("call", c.buffer);
                    })
                  }
                  disabled={!!busy || !!scriptError}
                  className={secondary}
                >
                  {callIsCurrent ? "▶ Hear the announcer" : "🎙️ Make the announcer call"}
                </button>
              </>
            )}
          </>
        ) : (
          <p className="text-base">The announcer needs sign-in.</p>
        )}
      </section>

      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Song volume</span>
        <input
          type="range"
          min={0.2}
          max={2}
          step={0.1}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-10 w-full accent-[var(--team)]"
        />
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

      <div className="flex flex-col gap-2">
        <button
          onClick={playing === "preview" ? stopAll : preview}
          disabled={!!busy || !songReady}
          className={secondary}
        >
          {playing === "preview" ? "■ Stop" : "▶ Preview the walk-up"}
        </button>
        <button onClick={save} disabled={!!busy || !songReady} className={primary}>
          Save walk-up
        </button>
        {!isCoach && (
          <p className="text-center text-sm text-slate-600">
            A coach OKs it before it plays at games.
          </p>
        )}
        {existing && (
          <button
            onClick={() =>
              run("Removing…", async () => {
                stopAll();
                await onRemove(existing);
                onDone();
              })
            }
            disabled={!!busy}
            className="h-12 text-base font-bold text-red-700 underline"
          >
            Remove this walk-up
          </button>
        )}
      </div>
    </div>
  );
}
