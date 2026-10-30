"use client";

import { useEffect, useMemo, useState } from "react";
import { formatGameDate, splitGames } from "@/lib/data/game";
import { isCoach, permissionsFor } from "@/lib/data/permissions";
import { useAppData } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import { batters, filesFor, type Batter } from "@/lib/pa/order";
import { BUILT_IN_SOUNDS } from "@/lib/pa/sounds";
import { CATEGORY_LABEL, type SoundCategory, type TeamSound, type Walkup } from "@/lib/pa/types";
import type { Player } from "@/lib/rules/types";
import { AppShell, Loading } from "../AppShell";
import { Sheet } from "../Sheet";
import { loadBuffer } from "./buffers";
import { getVolume, playBuffer, playBuiltIn, playWalkup, setVolume, stopAll } from "./engine";
import { getReady, isOnDevice, usePa, type PaData } from "./paData";
import { SoundForm } from "./SoundForm";
import { usePlaying } from "./usePlaying";
import { WalkupEditor } from "./WalkupEditor";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";

export function PaScreen() {
  const data = useAppData();
  if (!data) {
    return (
      <AppShell title="Gameday PA" tab="pa">
        <Loading />
      </AppShell>
    );
  }
  return <Pa data={data} />;
}

function Pa({ data }: { data: AppData }) {
  const pa = usePa(data.team.id);
  const perms = permissionsFor(data.me.role, data.team.optionedAt !== null);
  const staff = perms.editTeam;
  const coach = isCoach(data.me.role) && data.team.optionedAt === null;
  const [view, setView] = useState<"pa" | "walkups">(staff ? "pa" : "walkups");

  const shell = (children: React.ReactNode) => (
    <AppShell title="Gameday PA" subtitle={data.team.name} tab="pa">
      {children}
    </AppShell>
  );
  if (pa.loading) return shell(<Loading />);
  if (pa.error) {
    return shell(
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
        Couldn&apos;t load the PA ({pa.error}).
      </p>,
    );
  }

  const waiting = pa.walkups.filter((w) => w.status === "pending").length;
  return shell(
    <>
      {pa.offline && (
        <p className="mb-3 rounded-xl bg-amber-50 p-3 text-base font-semibold text-amber-900">
          No signal: using what&apos;s saved on this device.
        </p>
      )}
      {staff && (
        <div className="mb-4 grid grid-cols-2 gap-2" role="tablist">
          {(
            [
              ["pa", "PA"],
              ["walkups", `Walk-ups${coach && waiting ? ` (${waiting} to OK)` : ""}`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`h-12 rounded-xl text-base font-bold ${
                view === v ? "bg-[var(--team)] text-white" : "border-2 border-slate-300 bg-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {view === "pa" && staff ? (
        <Board data={data} pa={pa} />
      ) : (
        <Walkups data={data} pa={pa} staff={staff} coach={coach} />
      )}
    </>,
  );
}

// ── The PA board: now batting, the lineup, the soundboard ──

function Board({ data, pa }: { data: AppData; pa: PaData }) {
  const games = useMemo(() => {
    const { upcoming, final } = splitGames(data.games);
    return [...upcoming, ...final.slice(0, 3)];
  }, [data.games]);
  const [gameId, setGameId] = useState(
    () =>
      games.find((g) => (data.lineups[g.id]?.battingOrder.length ?? 0) > 0)?.id ??
      games[0]?.id ??
      "",
  );
  const list = useMemo(
    () => batters(data.lineups[gameId], data.players, pa.walkups),
    [data.lineups, data.players, gameId, pa.walkups],
  );
  const [at, setAt] = useState(0);
  const current = list[Math.min(at, Math.max(0, list.length - 1))];
  const next = list.length ? list[(at + 1) % list.length] : undefined;
  const playing = usePlaying();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<SoundCategory | null>(null);
  const [editing, setEditing] = useState(false);
  const [vol, setVol] = useState(getVolume);

  useWakeLock();
  useEffect(() => stopAll, []);

  const play = async (b: Batter) => {
    setError(null);
    if (!b.walkup || !b.ready) return;
    try {
      const [song, call] = await Promise.all([
        loadBuffer(b.walkup.songPath),
        b.walkup.announce && b.walkup.announcePath
          ? loadBuffer(b.walkup.announcePath)
          : Promise.resolve(null),
      ]);
      playWalkup(`walkup:${b.player.id}`, song, call, {
        mode: b.walkup.announceMode,
        volume: b.walkup.volume,
      });
    } catch {
      setError(`Couldn't play ${b.player.name}'s walk-up. Tap "Get ready" while you have signal.`);
    }
  };

  const playTeamSound = async (s: TeamSound) => {
    setError(null);
    try {
      playBuffer(s.id, await loadBuffer(s.path));
    } catch {
      setError(`Couldn't play "${s.label}". Tap "Get ready" while you have signal.`);
    }
  };

  const files = filesFor(
    list,
    pa.sounds.map((s) => s.path),
  );

  return (
    <div className="flex flex-col gap-5 pb-28">
      <label className="flex flex-col gap-1">
        <span className={heading}>Game</span>
        <select
          value={gameId}
          onChange={(e) => {
            setGameId(e.target.value);
            setAt(0);
          }}
          className="h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
        >
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              vs {g.opponent} · {formatGameDate(g)}
            </option>
          ))}
        </select>
      </label>

      {pa.signedIn && <ReadyOffline key={files.join("|")} paths={files} />}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}

      {/* Now batting */}
      {current ? (
        <section className="rounded-2xl bg-[var(--team)] p-4 text-white shadow">
          <p className="text-sm font-bold tracking-wide text-white/70 uppercase">
            Now batting · {current.order} of {list.length}
          </p>
          <p className="truncate text-3xl font-black">
            {current.player.name}
            {current.player.jerseyNumber != null && (
              <span className="ml-2 text-white/70">#{current.player.jerseyNumber}</span>
            )}
          </p>
          <button
            onClick={() =>
              playing === `walkup:${current.player.id}` ? stopAll() : void play(current)
            }
            disabled={!current.ready}
            className="mt-3 h-16 w-full rounded-xl bg-white text-xl font-black text-[var(--team)] active:bg-slate-100 disabled:bg-white/30 disabled:text-white"
          >
            {playing === `walkup:${current.player.id}`
              ? "■ Stop"
              : current.ready
                ? "▶ Play walk-up"
                : current.walkup
                  ? "Waiting for a coach's OK"
                  : "No walk-up yet"}
          </button>
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <button
              onClick={() => setAt((at - 1 + list.length) % list.length)}
              aria-label="Previous batter"
              className="h-14 w-14 rounded-xl bg-white/15 text-2xl font-bold active:bg-white/25"
            >
              ‹
            </button>
            <button
              onClick={() => setAt((at + 1) % list.length)}
              className="h-14 truncate rounded-xl bg-white/15 px-3 text-lg font-bold active:bg-white/25"
            >
              Next: {next?.player.name} ›
            </button>
          </div>
        </section>
      ) : (
        <p className="rounded-xl border-2 border-slate-200 p-4 text-base">
          This game has no batting order yet. Set one on the game&apos;s lineup to line up the
          walk-ups. The soundboard works anytime.
        </p>
      )}

      {list.length > 0 && (
        <section>
          <h2 className={heading}>Batting order</h2>
          <ul className="grid gap-1 md:grid-cols-2">
            {list.map((b, i) => (
              <li key={b.player.id}>
                <div
                  className={`flex items-center gap-2 rounded-xl p-1 pl-3 ${
                    i === at ? "bg-amber-100 ring-2 ring-amber-400" : "bg-white"
                  }`}
                >
                  <button
                    onClick={() => setAt(i)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-base"
                  >
                    <span className="w-6 shrink-0 font-bold text-slate-500">{b.order}</span>
                    <span className="truncate font-semibold">{b.player.name}</span>
                    {!b.ready && (
                      <span className="shrink-0 text-sm text-slate-500">
                        {b.walkup ? "needs OK" : "no song"}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setAt(i);
                      if (playing === `walkup:${b.player.id}`) stopAll();
                      else void play(b);
                    }}
                    disabled={!b.ready}
                    aria-label={`Play ${b.player.name}'s walk-up`}
                    className="size-12 shrink-0 rounded-lg bg-[var(--team)] text-lg font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {playing === `walkup:${b.player.id}` ? "■" : "▶"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Soundboard */}
      {(Object.keys(CATEGORY_LABEL) as SoundCategory[]).map((cat) => {
        const teamSounds = pa.sounds.filter((s) => s.category === cat);
        return (
          <section key={cat}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-wide text-slate-600 uppercase">
                {CATEGORY_LABEL[cat]}
              </h2>
              <button
                onClick={() => setAdding(cat)}
                className="h-10 rounded-lg px-2 text-base font-bold text-[var(--team)] underline"
              >
                + Add
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-6">
              {BUILT_IN_SOUNDS.filter((s) => s.category === cat).map((s) => (
                <Tile
                  key={s.id}
                  icon={s.icon}
                  label={s.label}
                  active={playing === s.id}
                  onPlay={() => (playing === s.id ? stopAll() : playBuiltIn(s))}
                />
              ))}
              {teamSounds.map((s) => (
                <div key={s.id} className="relative">
                  <Tile
                    icon={s.source === "ai" ? "✨" : "🎵"}
                    label={s.label}
                    active={playing === s.id}
                    onPlay={() => (playing === s.id ? stopAll() : void playTeamSound(s))}
                  />
                  {editing && (
                    <button
                      onClick={() =>
                        void pa
                          .removeSound(s)
                          .catch((e: unknown) =>
                            setError(e instanceof Error ? e.message : String(e)),
                          )
                      }
                      aria-label={`Remove ${s.label}`}
                      className="absolute -top-2 -right-2 size-9 rounded-full bg-red-700 text-lg font-bold text-white shadow"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {pa.sounds.length > 0 && (
        <button
          onClick={() => setEditing(!editing)}
          className="h-12 rounded-xl border-2 border-slate-300 text-base font-bold"
        >
          {editing ? "Done removing" : "Remove team sounds…"}
        </button>
      )}

      {/* Always within reach: stop everything, and the volume. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:left-56">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            onClick={stopAll}
            className="h-14 shrink-0 rounded-xl bg-red-700 px-6 text-lg font-black text-white active:bg-red-800"
          >
            ■ Stop
          </button>
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span aria-hidden="true" className="text-xl">
              🔊
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vol}
              aria-label="Volume"
              onChange={(e) => {
                setVol(Number(e.target.value));
                setVolume(Number(e.target.value));
              }}
              className="h-10 w-full accent-[var(--team)]"
            />
          </label>
        </div>
      </div>

      <Sheet open={adding !== null} title="Add a sound" onClose={() => setAdding(null)}>
        {adding && (
          <SoundForm
            teamId={data.team.id}
            signedIn={pa.signedIn}
            initialCategory={adding}
            onAdd={pa.addSound}
            onDone={() => setAdding(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function Tile({
  icon,
  label,
  active,
  onPlay,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      onClick={onPlay}
      aria-pressed={active}
      className={`flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 p-1 text-center text-sm leading-tight font-bold ${
        active
          ? "border-[var(--team)] bg-[var(--team)] text-white"
          : "border-slate-200 bg-white active:bg-slate-100"
      }`}
    >
      <span aria-hidden="true" className="text-2xl">
        {icon}
      </span>
      <span className="line-clamp-2">{label}</span>
    </button>
  );
}

/** Downloads everything this game's PA needs, so it plays with no signal. */
function ReadyOffline({ paths }: { paths: string[] }) {
  const [state, setState] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    void Promise.all(paths.map(isOnDevice)).then((have) => {
      if (current) setState({ done: have.filter(Boolean).length, total: paths.length, failed: 0 });
    });
    return () => {
      current = false;
    };
  }, [paths]);

  if (!state || paths.length === 0) return null;
  const ready = state.done === state.total && state.failed === 0;
  if (ready) {
    return (
      <p className="rounded-xl border-2 border-green-700 bg-green-50 p-3 text-base font-semibold text-green-900">
        ✓ Ready offline: every walk-up and team sound is on this device.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
      <p className="min-w-0 flex-1 text-base">
        {busy
          ? `Downloading ${state.done} of ${state.total}…`
          : state.failed
            ? `${state.failed} couldn't download. Try again with signal.`
            : `${state.total - state.done} of ${state.total} sounds aren't on this device yet.`}
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const { failed } = await getReady(paths, (done, total) =>
            setState({ done, total, failed: 0 }),
          );
          setState((s) => s && { ...s, done: s.total - failed, failed });
          setBusy(false);
        }}
        className="h-12 shrink-0 rounded-xl bg-[var(--team)] px-4 text-base font-bold text-white disabled:opacity-50"
      >
        Get ready
      </button>
    </div>
  );
}

/** Keep the screen on while the PA is up (where the phone allows it). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const grab = () => {
      if (document.visibilityState === "visible" && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then(
          (l) => (lock = l),
          () => undefined,
        );
      }
    };
    grab();
    document.addEventListener("visibilitychange", grab);
    return () => {
      document.removeEventListener("visibilitychange", grab);
      void lock?.release();
    };
  }, []);
}

// ── Walk-ups: set them up, and coaches OK them ──

function Walkups({
  data,
  pa,
  staff,
  coach,
}: {
  data: AppData;
  pa: PaData;
  staff: boolean;
  coach: boolean;
}) {
  const [open, setOpen] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playing = usePlaying();
  const mine = new Set(
    data.guardians.filter((g) => g.userId === data.me.userId).map((g) => g.playerId),
  );
  const kids = data.players.filter((p) => p.active !== false && (staff || mine.has(p.id)));
  const byPlayer = new Map(pa.walkups.map((w) => [w.playerId, w]));
  const waiting = coach ? kids.filter((p) => byPlayer.get(p.id)?.status === "pending") : [];
  const readOnly = data.team.optionedAt !== null;

  const preview = async (p: Player, w: Walkup) => {
    setError(null);
    try {
      const [song, call] = await Promise.all([
        loadBuffer(w.songPath),
        w.announce && w.announcePath ? loadBuffer(w.announcePath) : Promise.resolve(null),
      ]);
      playWalkup(`preview:${p.id}`, song, call, { mode: w.announceMode, volume: w.volume });
    } catch {
      setError("Couldn't load that walk-up. Check your signal.");
    }
  };

  if (!kids.length) {
    return (
      <p className="text-lg">
        {staff
          ? "Add players to the roster to set up walk-ups."
          : "You're not linked to a kid yet. Ask a coach to link you on Coaches & parents, then set up their walk-up song here."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {!staff && (
        <p className="text-base">
          Make your kid&apos;s walk-up: an AI song (with their name in it, if you like) or a song
          you upload, plus the announcer. A coach OKs it before it plays at games.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}

      {waiting.length > 0 && (
        <section>
          <h2 className={heading}>Waiting for your OK</h2>
          <ul className="flex flex-col gap-2">
            {waiting.map((p) => {
              const w = byPlayer.get(p.id)!;
              return (
                <li key={p.id} className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
                  <p className="text-lg font-bold">{p.name}</p>
                  {w.songPrompt && <p className="text-sm text-slate-600">{w.songPrompt}</p>}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        playing === `preview:${p.id}` ? stopAll() : void preview(p, w)
                      }
                      className="h-12 rounded-xl border-2 border-slate-400 bg-white text-base font-bold"
                    >
                      {playing === `preview:${p.id}` ? "■ Stop" : "▶ Listen"}
                    </button>
                    <button
                      onClick={() =>
                        void pa
                          .approve(w)
                          .catch((e: unknown) =>
                            setError(e instanceof Error ? e.message : String(e)),
                          )
                      }
                      className="h-12 rounded-xl bg-green-700 text-base font-bold text-white active:bg-green-800"
                    >
                      ✓ OK it
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className={heading}>{staff ? "Players" : "Your kids"}</h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {kids.map((p) => {
            const w = byPlayer.get(p.id);
            return (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white p-2 pl-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">
                    {p.name}
                    {p.jerseyNumber != null && (
                      <span className="ml-1 font-semibold text-slate-500">#{p.jerseyNumber}</span>
                    )}
                  </p>
                  <p
                    className={`text-sm font-semibold ${
                      !w
                        ? "text-slate-500"
                        : w.status === "approved"
                          ? "text-green-800"
                          : "text-amber-800"
                    }`}
                  >
                    {!w
                      ? "No walk-up yet"
                      : w.status === "approved"
                        ? "✓ Ready"
                        : "Waiting for a coach's OK"}
                  </p>
                </div>
                {w && (
                  <button
                    onClick={() => (playing === `preview:${p.id}` ? stopAll() : void preview(p, w))}
                    aria-label={`Listen to ${p.name}'s walk-up`}
                    className="size-12 shrink-0 rounded-lg border-2 border-slate-300 text-lg font-bold"
                  >
                    {playing === `preview:${p.id}` ? "■" : "▶"}
                  </button>
                )}
                {!readOnly && (
                  <button
                    onClick={() => setOpen(p)}
                    className="h-12 shrink-0 rounded-lg bg-[var(--team)] px-4 text-base font-bold text-white active:bg-[var(--team-press)]"
                  >
                    {w ? "Edit" : "Set up"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <Sheet
        open={open !== null}
        title={open ? `${open.name}'s walk-up` : "Walk-up"}
        onClose={() => {
          stopAll();
          setOpen(null);
        }}
      >
        {open && (
          <WalkupEditor
            teamId={data.team.id}
            player={open}
            existing={byPlayer.get(open.id) ?? null}
            isCoach={coach}
            signedIn={pa.signedIn}
            onSave={pa.saveWalkup}
            onRemove={pa.removeWalkup}
            onDone={() => setOpen(null)}
          />
        )}
      </Sheet>
    </div>
  );
}
