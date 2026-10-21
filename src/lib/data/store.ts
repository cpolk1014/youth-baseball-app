"use client";

import { useSyncExternalStore } from "react";
import type { Lineup, Player } from "@/lib/rules/types";
import { SEED_DATA } from "./seed";
import type { AppData, Game, GameLineup, GameStatus } from "./types";

// Local stand-in for Supabase until the project is connected: one team's data, kept in
// localStorage. Screens only use the hooks and actions below, so swapping this module
// for Supabase queries doesn't touch them.

const STORAGE_KEY = "lineup-app:v1";
const listeners = new Set<() => void>();
let data: AppData | null = null;

function load(): AppData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppData;
  } catch {
    // Private mode or bad JSON: fall back to seed data.
  }
  return SEED_DATA;
}

function getSnapshot(): AppData {
  data ??= load();
  return data;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(fn: (current: AppData) => AppData): void {
  data = fn(getSnapshot());
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable: keep working in memory.
  }
  for (const listener of listeners) listener();
}

/** Current app data outside React (e.g. in tests). */
export function getAppData(): AppData {
  return getSnapshot();
}

/** App data, or null while rendering on the server / before hydration. */
export function useAppData(): AppData | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function savePlayer(player: Player): void {
  update((d) => {
    const exists = d.players.some((p) => p.id === player.id);
    return {
      ...d,
      players: exists
        ? d.players.map((p) => (p.id === player.id ? player : p))
        : [...d.players, player],
    };
  });
}

export function saveGame(game: Game): void {
  update((d) => {
    const exists = d.games.some((g) => g.id === game.id);
    // Keep the saved lineup's length in step with the game (it feeds season totals).
    const lineup = d.lineups[game.id];
    const lineups = lineup
      ? {
          ...d.lineups,
          [game.id]: {
            ...lineup,
            innings: game.innings,
            slots: lineup.slots.filter((s) => s.inning <= game.innings),
          },
        }
      : d.lineups;
    return {
      ...d,
      games: exists ? d.games.map((g) => (g.id === game.id ? game : g)) : [...d.games, game],
      lineups,
    };
  });
}

export function setGameStatus(gameId: string, status: GameStatus): void {
  update((d) => ({ ...d, games: d.games.map((g) => (g.id === gameId ? { ...g, status } : g)) }));
}

export function saveLineup(gameId: string, lineup: Lineup, autoFillSeed?: number): void {
  update((d) => {
    const seed = autoFillSeed ?? d.lineups[gameId]?.autoFillSeed ?? 0;
    const next: GameLineup = { ...lineup, autoFillSeed: seed };
    return { ...d, lineups: { ...d.lineups, [gameId]: next } };
  });
}

export function resetLocalData(): void {
  update(() => SEED_DATA);
}

export function newId(): string {
  return crypto.randomUUID();
}
