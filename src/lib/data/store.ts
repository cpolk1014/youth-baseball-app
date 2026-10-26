"use client";

import { useSyncExternalStore } from "react";
import type { Lineup, Player } from "@/lib/rules/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { TeamRow } from "@/lib/supabase/rows";
import { SEED_DATA } from "./seed";
import type { AppData, Game, GameLineup, GameStatus } from "./types";

// One team's data for the screens. Without Supabase env vars it lives in localStorage
// (local mode). With them, it loads from Supabase after sign-in; changes apply on
// screen at once and are saved in order in the background. A failed save reloads from
// the database and shows an error.

export type StoreStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "setup"; team: TeamRow | null }
  | { kind: "error"; message: string };

export interface StoreState {
  status: StoreStatus;
  /** Shown as a banner when a background save fails. */
  saveError: string | null;
  /** Signed-in user's email (Supabase mode only). */
  email: string | null;
  mode: "local" | "supabase";
}

const STORAGE_KEY = "lineup-app:v1";
const SEEDS_KEY = "lineup-app:autofill-seeds";
const SERVER_STATE: StoreState = {
  status: { kind: "loading" },
  saveError: null,
  email: null,
  mode: "local",
};

const listeners = new Set<() => void>();
let data: AppData | null = null;
let state: StoreState = {
  ...SERVER_STATE,
  mode: isSupabaseConfigured ? "supabase" : "local",
  status: isSupabaseConfigured ? { kind: "loading" } : { kind: "ready" },
};
let loadStarted = false;
let saveQueue: Promise<void> = Promise.resolve();

function notify(): void {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<StoreState>): void {
  state = { ...state, ...patch };
  notify();
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // private mode, no window (tests), or bad JSON
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: keep working in memory.
  }
}

async function loadRemote(): Promise<void> {
  const { loadFromSupabase } = await import("./supabase-backend");
  try {
    const result = await loadFromSupabase(readJson<Record<string, number>>(SEEDS_KEY) ?? {});
    if (result.kind === "ready") {
      data = result.data;
      setState({ status: { kind: "ready" }, email: result.email });
    } else {
      data = null;
      setState({ status: { kind: "setup", team: result.team }, email: result.email });
    }
  } catch (e) {
    setState({ status: { kind: "error", message: e instanceof Error ? e.message : String(e) } });
  }
}

/** Fill in fields added after data was first saved in this browser. */
function upgradeLocalData(d: AppData): AppData {
  return {
    ...d,
    team: { ...d.team, coachPitch: d.team.coachPitch ?? false },
    games: d.games.map((g) => ({ ...g, fieldPlayers: g.fieldPlayers ?? 9 })),
  };
}

function getSnapshot(): AppData | null {
  if (state.mode === "local") {
    data ??= upgradeLocalData(readJson<AppData>(STORAGE_KEY) ?? SEED_DATA);
  }
  return data;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (state.mode === "supabase" && !loadStarted) {
    loadStarted = true;
    void loadRemote();
  }
  return () => listeners.delete(listener);
}

/** Apply a change on screen now; in Supabase mode, queue `save` to run after earlier saves. */
function update(fn: (current: AppData) => AppData, save?: () => Promise<void>): void {
  const current = getSnapshot();
  if (!current) return;
  data = fn(current);
  if (state.mode === "local") writeJson(STORAGE_KEY, data);
  notify();
  if (state.mode === "supabase" && save) {
    saveQueue = saveQueue.then(save).catch(async (e: unknown) => {
      setState({
        saveError: `Couldn't save your last change (${e instanceof Error ? e.message : String(e)}). Showing the latest saved data.`,
      });
      await loadRemote();
    });
  }
}

const remote = () => import("./supabase-backend");

/** Current app data outside React (e.g. in tests). */
export function getAppData(): AppData {
  return getSnapshot() ?? SEED_DATA;
}

/** App data, or null while loading (or rendering on the server). */
export function useAppData(): AppData | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function useStoreState(): StoreState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

export function dismissSaveError(): void {
  setState({ saveError: null });
}

export function reloadData(): void {
  setState({ status: { kind: "loading" } });
  void loadRemote();
}

export function savePlayer(player: Player): void {
  update(
    (d) => {
      const exists = d.players.some((p) => p.id === player.id);
      return {
        ...d,
        players: exists
          ? d.players.map((p) => (p.id === player.id ? player : p))
          : [...d.players, player],
      };
    },
    async () => (await remote()).savePlayerRow(player, data!.team.id),
  );
}

export function saveGame(game: Game): void {
  let trimmed: Lineup | null = null;
  update(
    (d) => {
      const exists = d.games.some((g) => g.id === game.id);
      // Keep the saved lineup's length in step with the game (it feeds season totals).
      const lineup = d.lineups[game.id];
      let lineups = d.lineups;
      if (lineup && lineup.innings !== game.innings) {
        const next = {
          ...lineup,
          innings: game.innings,
          slots: lineup.slots.filter((s) => s.inning <= game.innings),
        };
        if (next.slots.length !== lineup.slots.length) trimmed = next;
        lineups = { ...d.lineups, [game.id]: next };
      }
      return {
        ...d,
        games: exists ? d.games.map((g) => (g.id === game.id ? game : g)) : [...d.games, game],
        lineups,
      };
    },
    async () => (await remote()).saveGameRow(game, trimmed),
  );
}

export function setCoachPitch(coachPitch: boolean): void {
  update(
    (d) => ({ ...d, team: { ...d.team, coachPitch } }),
    async () => (await remote()).saveTeamSettings(data!.team.id, coachPitch),
  );
}

export function setGameStatus(gameId: string, status: GameStatus): void {
  update(
    (d) => ({ ...d, games: d.games.map((g) => (g.id === gameId ? { ...g, status } : g)) }),
    async () => (await remote()).saveGameStatus(gameId, status),
  );
}

export function saveLineup(gameId: string, lineup: Lineup, autoFillSeed?: number): void {
  update(
    (d) => {
      const seed = autoFillSeed ?? d.lineups[gameId]?.autoFillSeed ?? 0;
      if (state.mode === "supabase" && autoFillSeed !== undefined) {
        // Auto-fill seeds are a per-device convenience; they aren't stored in the database.
        writeJson(SEEDS_KEY, {
          ...(readJson<Record<string, number>>(SEEDS_KEY) ?? {}),
          [gameId]: seed,
        });
      }
      const next: GameLineup = {
        innings: lineup.innings,
        battingOrder: lineup.battingOrder,
        notBatting: lineup.notBatting ?? [],
        slots: lineup.slots,
        autoFillSeed: seed,
      };
      return { ...d, lineups: { ...d.lineups, [gameId]: next } };
    },
    async () => (await remote()).saveLineupRpc(gameId, lineup),
  );
}

/** Supabase mode: create the user's team and/or first season, then load it. */
export async function createTeam(input: {
  teamName: string;
  ageGroup: string;
  coachPitch: boolean;
  seasonName: string;
}): Promise<void> {
  const team = state.status.kind === "setup" ? state.status.team : null;
  await (await remote()).createTeamAndSeason({ ...input, team });
  reloadData();
}

export async function signOut(): Promise<void> {
  await (await remote()).signOut();
  // A full page load (not router.push) so the signed-in user's data in memory is dropped.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

export function resetLocalData(): void {
  update(() => SEED_DATA);
}

export function newId(): string {
  return crypto.randomUUID();
}
