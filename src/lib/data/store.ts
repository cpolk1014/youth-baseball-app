"use client";

import { useSyncExternalStore } from "react";
import type { Lineup, Player } from "@/lib/rules/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { TeamRow } from "@/lib/supabase/rows";
import type { MemberRole } from "./permissions";
import { receiptPath } from "@/lib/finance/receipt";
import type { RuleConfigInput } from "@/lib/rules/config";
import type { FinanceEntry, FinanceShare } from "@/lib/finance/types";
import { SEED_DATA } from "./seed";
import type {
  AppData,
  Game,
  GameLineup,
  GameStatus,
  Guardian,
  PlayAssignment,
  Practice,
  QuizResult,
} from "./types";

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
let pendingSaves = 0;

// Closing or reloading the page drops saves that haven't run yet, so ask first.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (pendingSaves > 0) e.preventDefault();
  });
}

/** Run `save` after earlier saves. Resolves or rejects with this save's own outcome. */
function enqueue(save: () => Promise<void>): Promise<void> {
  pendingSaves++;
  const run = saveQueue.then(save);
  saveQueue = run
    .catch(() => {})
    .finally(() => {
      pendingSaves--;
    });
  return run;
}

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
    practices: (d.practices ?? []).map((p) => ({ ...p, plays: p.plays ?? [] })),
    assignments: d.assignments ?? [],
    quizResults: d.quizResults ?? [],
    guardians: d.guardians ?? [],
    financeEntries: d.financeEntries ?? [],
    financeShares: d.financeShares ?? [],
    financeSummary: null,
    groupme: null,
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
    enqueue(save).catch(async (e: unknown) => {
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

/** Mark a game final with its score (either score may be left out), or update the score. */
export function setGameResult(
  gameId: string,
  status: GameStatus,
  scoreUs: number | null,
  scoreThem: number | null,
): void {
  update(
    (d) => ({
      ...d,
      games: d.games.map((g) => (g.id === gameId ? { ...g, status, scoreUs, scoreThem } : g)),
    }),
    async () => (await remote()).saveGameResult(gameId, status, scoreUs, scoreThem),
  );
}

/** Coach: save the team's colors and logo. */
export function saveTeamLook(colors: string[], logoPath: string | null): void {
  const teamId = data!.team.id;
  update(
    (d) => ({
      ...d,
      team: { ...d.team, colors, logoPath },
      myTeams: d.myTeams.map((t) => (t.id === teamId ? { ...t, colors, logoPath } : t)),
    }),
    async () => (await remote()).saveTeamLookRow(teamId, colors, logoPath),
  );
}

/** Upload a logo picture; returns where it's stored (a data URL in local mode). */
export async function uploadLogo(file: Blob): Promise<string> {
  if (state.mode !== "supabase") {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Couldn't read the picture."));
      reader.readAsDataURL(file);
    });
  }
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${data!.team.id}/logo-${newId()}.${ext}`;
  await (await remote()).uploadLogoFile(path, file);
  return path;
}

/** Remove an old logo file; failures only leave an unused file behind. */
export async function removeLogo(path: string): Promise<void> {
  if (state.mode !== "supabase" || path.startsWith("data:")) return;
  try {
    await (await remote()).deleteLogoFile(path);
  } catch {
    // Not worth bothering the coach about.
  }
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

let syncing: Promise<boolean> | null = null;
let lastSync = Date.now();

/**
 * Pull the latest saved data (what other phones and computers changed) without a loading
 * screen. Waits for this device's own saves first. With no signal it keeps what's on
 * screen and resolves false. Also tells other parts of the app (the PA) to reload.
 */
export function syncNow(): Promise<boolean> {
  if (state.mode !== "supabase" || state.status.kind !== "ready") return Promise.resolve(false);
  syncing ??= (async () => {
    try {
      await saveQueue;
      const { loadFromSupabase } = await import("./supabase-backend");
      const result = await loadFromSupabase(
        readJson<Record<string, number>>(SEEDS_KEY) ?? {},
        readJson<string>(TEAM_KEY),
      );
      // A save started while loading would be undone by older data; the next sync gets it.
      if (pendingSaves > 0) return false;
      if (result.kind === "ready") {
        data = result.data;
        setState({ status: { kind: "ready" }, email: result.email });
      } else {
        data = null;
        setState({ status: { kind: "setup", team: result.team }, email: result.email });
      }
      lastSync = Date.now();
      window.dispatchEvent(new Event(SYNC_EVENT));
      return true;
    } catch {
      return false;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** Fired on window after a sync, for data kept outside this store. */
export const SYNC_EVENT = "rallycap:sync";

// Coming back to the app after a while (another tab, a locked phone, a laptop lid):
// pick up what changed elsewhere.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastSync > 30_000) {
      void syncNow();
    }
  });
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

/**
 * Add imported practices and games, saving them in one batch and waiting until they're
 * stored. Throws if the save fails (after reloading what was actually saved); retrying
 * with the same ids updates rather than duplicates.
 */
export async function importSchedule(practices: Practice[], games: Game[]): Promise<void> {
  update((d) => ({
    ...d,
    practices: [...d.practices.filter((p) => !practices.some((x) => x.id === p.id)), ...practices],
    games: [...d.games.filter((g) => !games.some((x) => x.id === g.id)), ...games],
  }));
  if (state.mode !== "supabase") return;
  try {
    await enqueue(async () => {
      const r = await remote();
      await r.savePracticeRows(practices);
      await r.saveGameRows(games);
    });
  } catch (e) {
    await loadRemote();
    throw e;
  }
}

/** Add or update a homework assignment of plays. */
export function saveAssignment(assignment: PlayAssignment): void {
  update(
    (d) => ({
      ...d,
      assignments: [assignment, ...d.assignments.filter((a) => a.id !== assignment.id)],
    }),
    async () => (await remote()).saveAssignmentRow(assignment, data!.team.id),
  );
}

export function deleteAssignment(assignmentId: string): void {
  update(
    (d) => ({
      ...d,
      assignments: d.assignments.filter((a) => a.id !== assignmentId),
      quizResults: d.quizResults.filter((q) => q.assignmentId !== assignmentId),
    }),
    async () => (await remote()).deleteAssignmentRow(assignmentId),
  );
}

/** Record a finished quiz on an assignment for the signed-in family member. */
export function recordQuizResult(result: Omit<QuizResult, "id" | "userId" | "completedAt">): void {
  const full: QuizResult = {
    ...result,
    id: newId(),
    userId: data ? myUserId(data) : "local",
    completedAt: new Date().toISOString(),
  };
  update(
    (d) => ({ ...d, quizResults: [...d.quizResults, full] }),
    async () => (await remote()).saveQuizResultRow(full),
  );
}

/** The signed-in user's id, or "local" without Supabase. */
export function myUserId(d: AppData): string {
  return d.me.userId ?? "local";
}

/** Set which kids a team member is the parent of (saved and awaited as one batch). */
export async function setKidsFor(userId: string, playerIds: string[]): Promise<void> {
  const current = data!.guardians.filter((g) => g.userId === userId);
  const remove = current.filter((g) => !playerIds.includes(g.playerId));
  const add: Guardian[] = playerIds
    .filter((id) => !current.some((g) => g.playerId === id))
    .map((playerId) => ({ id: newId(), playerId, userId }));
  if (remove.length === 0 && add.length === 0) return;
  update((d) => ({
    ...d,
    guardians: [...d.guardians.filter((g) => !remove.includes(g)), ...add],
  }));
  if (state.mode !== "supabase") return;
  try {
    await enqueue(async () =>
      (await remote()).saveGuardianChanges(
        remove.map((g) => g.id),
        add,
      ),
    );
  } catch (e) {
    await loadRemote();
    throw e;
  }
  // What a parent can see (their kids' charges, payments, quiz results) depends on these
  // links, and was loaded before they changed. Load again so it shows up right away.
  if (userId === data?.me.userId) await loadRemote();
}

/** Add or update a money entry with its shares; waits until it's saved (throws if not). */
export async function saveFinanceEntry(entry: FinanceEntry, shares: FinanceShare[]): Promise<void> {
  update((d) => ({
    ...d,
    financeEntries: [entry, ...d.financeEntries.filter((e) => e.id !== entry.id)],
    financeShares: [...d.financeShares.filter((s) => s.entryId !== entry.id), ...shares],
    // The server total is stale now; screens fall back to adding up what they can see.
    financeSummary: null,
  }));
  if (state.mode !== "supabase") return;
  try {
    await enqueue(async () => (await remote()).saveFinanceEntryRow(entry, shares));
  } catch (e) {
    await loadRemote();
    throw e;
  }
}

export async function deleteFinanceEntry(entryId: string): Promise<void> {
  update((d) => ({
    ...d,
    financeEntries: d.financeEntries.filter((e) => e.id !== entryId),
    financeShares: d.financeShares.filter((s) => s.entryId !== entryId),
    financeSummary: null,
  }));
  if (state.mode !== "supabase") return;
  try {
    await enqueue(async () => (await remote()).deleteFinanceEntryRow(entryId));
  } catch (e) {
    await loadRemote();
    throw e;
  }
}

/** Upload a receipt for a Walkoff and return its storage path (needs sign-in). */
export async function uploadReceipt(entryId: string, file: Blob): Promise<string> {
  const path = receiptPath(data!.team.id, entryId, newId(), file.type);
  await (await remote()).uploadReceiptFile(path, file);
  return path;
}

export async function receiptUrl(path: string): Promise<string> {
  return (await remote()).receiptSignedUrl(path);
}

/** Remove a receipt file; a failure only leaves an unused file behind, so it's ignored. */
export async function removeReceipt(path: string): Promise<void> {
  try {
    await (await remote()).deleteReceiptFile(path);
  } catch {
    // Not worth bothering the treasurer about.
  }
}

/** Connect (or change) the team's GroupMe bot; waits until it's saved. */
export async function saveGroupMe(botId: string, groupName: string | null): Promise<void> {
  const teamId = data!.team.id;
  await enqueue(async () => (await remote()).saveGroupMeRow(teamId, botId, groupName));
  update((d) => ({ ...d, groupme: { botId, groupName } }));
}

export async function disconnectGroupMe(): Promise<void> {
  const teamId = data!.team.id;
  await enqueue(async () => (await remote()).deleteGroupMeRow(teamId));
  update((d) => ({ ...d, groupme: null }));
}

/** Post a message to the team's GroupMe group (through the server). Throws with a reason. */
export async function postToGroupMe(text: string): Promise<void> {
  const res = await fetch("/api/groupme/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId: data!.team.id, text }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Couldn't post to GroupMe. Try again.");
  }
}

/** Coach: change the season's fair-play rules (only what differs from the defaults). */
export function saveSeasonRules(rules: RuleConfigInput): void {
  const seasonId = data!.season.id;
  update(
    (d) => ({ ...d, season: { ...d.season, fairPlayRules: rules } }),
    async () => (await remote()).saveSeasonRulesRow(seasonId, rules),
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
