"use client";

import { useSyncExternalStore } from "react";
import type { Lineup, Player } from "@/lib/rules/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { TeamRow } from "@/lib/supabase/rows";
import type { MemberRole } from "./permissions";
import { SEED_DATA } from "./seed";
import type { AppData, Game, GameLineup, GameStatus, Practice } from "./types";

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
const TEAM_KEY = "lineup-app:team-id";
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
    const result = await loadFromSupabase(
      readJson<Record<string, number>>(SEEDS_KEY) ?? {},
      readJson<string>(TEAM_KEY),
    );
    if (result.kind === "ready") {
      data = result.data;
      writeJson(TEAM_KEY, result.teamId);
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
    me: d.me ?? { userId: null, role: "coach" },
    members: d.members ?? [],
    invites: d.invites ?? [],
    practices: d.practices ?? [],
    myTeams: (
      d.myTeams ?? [
        {
          id: d.team.id,
          name: d.team.name,
          ageGroup: d.team.ageGroup,
          role: d.me?.role ?? "coach",
        },
      ]
    ).map((t) => ({ ...t, optioned: t.optioned ?? false })),
    team: {
      ...d.team,
      coachPitch: d.team.coachPitch ?? false,
      optionedAt: d.team.optionedAt ?? null,
    },
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
        absent: lineup.absent ?? [],
        slots: lineup.slots,
        autoFillSeed: seed,
      };
      return { ...d, lineups: { ...d.lineups, [gameId]: next } };
    },
    async () => (await remote()).saveLineupRpc(gameId, lineup),
  );
}

/** Reload team data in the background (no loading screen), e.g. after managing members. */
export async function refreshData(): Promise<void> {
  await loadRemote();
}

/** Coach: create an invite link; returns its full URL. */
export async function createInvite(role: MemberRole): Promise<string> {
  const token = await (await remote()).createInviteRow(data!.team.id, role);
  await refreshData();
  return inviteUrl(token);
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/join/${token}`;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await (await remote()).revokeInviteRow(inviteId);
  await refreshData();
}

export async function setMemberRole(memberId: string, role: MemberRole): Promise<void> {
  await (await remote()).setMemberRoleRow(memberId, role);
  await refreshData();
}

export async function removeMember(memberId: string): Promise<void> {
  await (await remote()).removeMemberRow(memberId);
  await refreshData();
}

/** After joining a team from an invite, open that team next time the app loads. */
export function preferTeam(teamId: string): void {
  writeJson(TEAM_KEY, teamId);
}

/**
 * Supabase mode: create a team (you become its coach) and its first season, then open it.
 * On the setup screen for a team with no season yet, only the season is created.
 */
export async function createTeam(input: {
  teamName: string;
  ageGroup: string;
  coachPitch: boolean;
  seasonName: string;
}): Promise<void> {
  const team = state.status.kind === "setup" ? state.status.team : null;
  const teamId = await (await remote()).createTeamAndSeason({ ...input, team });
  preferTeam(teamId);
  reloadData();
}

/** Coach: permanently delete the current team, then open another (or the setup screen). */
export async function deleteTeam(): Promise<void> {
  await (await remote()).deleteTeamRow(data!.team.id);
  writeJson(TEAM_KEY, null);
  // Full load so nothing from the deleted team lingers on screen.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/games");
}

/** Add or update a practice. */
export function savePractice(practice: Practice): void {
  update(
    (d) => {
      const exists = d.practices.some((p) => p.id === practice.id);
      return {
        ...d,
        practices: exists
          ? d.practices.map((p) => (p.id === practice.id ? practice : p))
          : [...d.practices, practice],
      };
    },
    async () => (await remote()).savePracticeRows([practice]),
  );
}

/** Add several practices at once (the season schedule builder). */
export function addPractices(practices: Practice[]): void {
  if (practices.length === 0) return;
  update(
    (d) => ({ ...d, practices: [...d.practices, ...practices] }),
    async () => (await remote()).savePracticeRows(practices),
  );
}

export function deletePractice(practiceId: string): void {
  update(
    (d) => ({ ...d, practices: d.practices.filter((p) => p.id !== practiceId) }),
    async () => (await remote()).deletePracticeRow(practiceId),
  );
}

/** Coach: option the current team (archive it, read-only) or call it back up. */
export function setOptioned(optioned: boolean): void {
  const optionedAt = optioned ? new Date().toISOString() : null;
  update(
    (d) => ({
      ...d,
      team: { ...d.team, optionedAt },
      myTeams: d.myTeams.map((t) => (t.id === d.team.id ? { ...t, optioned } : t)),
    }),
    async () => (await remote()).saveTeamOptioned(data!.team.id, optionedAt),
  );
}

/** Open another of the user's teams. */
export function switchTeam(teamId: string): void {
  if (teamId === data?.team.id) return;
  preferTeam(teamId);
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
