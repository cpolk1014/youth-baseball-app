"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cleanBatting,
  cleanPitching,
  type GameBatting,
  type GamePitching,
  type KidGame,
} from "@/lib/boxscore/stats";
import { SYNC_EVENT, useStoreState } from "@/lib/data/store";
import type { StatImport } from "@/lib/stats/form";
import type { TeamStats } from "@/lib/stats/gamechanger";
import { getBrowserSupabase } from "@/lib/supabase/client";

// The team's box scores (coaches and managers; the database enforces it): one line per kid
// per game, from a GameChanger box score or typed pitch counts. In local mode they live in
// this browser.

const localKey = (seasonId: string) => `rallycap:box:${seasonId}`;

interface Row {
  id: string;
  player_id: string | null;
  game_id: string | null;
  game_date: string;
  opponent: string;
  our_runs: number | null;
  their_runs: number | null;
  team_name: string | null;
  box_name: string | null;
  batting: unknown;
  pitching: unknown;
  errors: number;
  positions: string[];
  pitch_only: boolean;
}

const fromRow = (r: Row): KidGame => ({
  id: r.id,
  playerId: r.player_id ?? "",
  gameId: r.game_id,
  gameDate: r.game_date,
  opponent: r.opponent,
  ourRuns: r.our_runs,
  theirRuns: r.their_runs,
  teamName: r.team_name,
  boxName: r.box_name,
  batting: cleanBatting(r.batting),
  pitching: cleanPitching(r.pitching),
  errors: r.errors,
  positions: r.positions,
  pitchOnly: r.pitch_only,
  source: "coach",
});

/** One kid's line to save from a box score. */
export interface LineToSave {
  playerId: string;
  boxName: string | null;
  batting: GameBatting;
  pitching: GamePitching | null;
  errors: number;
  positions: string[];
}

/** One pitcher's typed count. */
export interface CountToSave {
  playerId: string;
  pitches: number;
  strikes: number | null;
}

function readLocal(seasonId: string): KidGame[] {
  try {
    return JSON.parse(window.localStorage.getItem(localKey(seasonId)) ?? "[]") as KidGame[];
  } catch {
    return [];
  }
}
function writeLocal(seasonId: string, lines: KidGame[]) {
  try {
    window.localStorage.setItem(localKey(seasonId), JSON.stringify(lines));
  } catch {
    // Full or unavailable: kept on screen for now.
  }
}

/** Every box score line this season (`enabled` false skips loading, for parents). */
export function useSeasonBoxScores(seasonId: string, enabled = true) {
  const { mode } = useStoreState();
  const signedIn = mode === "supabase";
  const [lines, setLines] = useState<KidGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    if (!enabled || !seasonId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to load
      setLoading(false);
      return;
    }
    if (!signedIn) {
      setLines(readLocal(seasonId));
      setLoading(false);
      return;
    }
    void getBrowserSupabase()
      .from("player_game_stat")
      .select(
        "id,player_id,game_id,game_date,opponent,our_runs,their_runs,team_name,box_name,batting,pitching,errors,positions,pitch_only",
      )
      .eq("season_id", seasonId)
      .eq("source", "coach")
      .order("game_date", { ascending: false })
      .then(({ data, error: e }) => {
        if (!current) return;
        if (e) setError(e.message);
        else {
          setError(null);
          setLines(((data ?? []) as Row[]).map(fromRow));
        }
        setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [seasonId, signedIn, enabled, version]);

  useEffect(() => {
    const onSync = () => setVersion((v) => v + 1);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  /** Save a game's box score (replaces the one there). */
  const save = useCallback(
    async (game: { id: string; date: string; opponent: string }, toSave: LineToSave[]) => {
      if (!signedIn) {
        const rest = readLocal(seasonId).filter((l) => l.gameId !== game.id);
        const next = [
          ...toSave.map((l): KidGame => ({
            id: crypto.randomUUID(),
            playerId: l.playerId,
            gameId: game.id,
            gameDate: game.date,
            opponent: game.opponent,
            ourRuns: null,
            theirRuns: null,
            teamName: null,
            boxName: l.boxName,
            batting: l.batting,
            pitching: l.pitching,
            errors: l.errors,
            positions: l.positions,
            pitchOnly: false,
            source: "coach",
          })),
          ...rest,
        ];
        writeLocal(seasonId, next);
        setLines(next);
        return;
      }
      const { error: e } = await getBrowserSupabase().rpc("save_game_box_score", {
        p_game: game.id,
        p_lines: toSave.map((l) => ({
          player_id: l.playerId,
          box_name: l.boxName,
          batting: l.batting,
          pitching: l.pitching,
          errors: l.errors,
          positions: l.positions,
        })),
        p_pitch_only: false,
      });
      if (e) throw new Error(`Couldn't save the box score (${e.message}).`);
      setVersion((v) => v + 1);
    },
    [signedIn, seasonId],
  );

  /** Save every pitcher's count for a game (typed by hand). */
  const savePitches = useCallback(
    async (game: { id: string; date: string; opponent: string }, counts: CountToSave[]) => {
      if (!signedIn) {
        const all = readLocal(seasonId);
        const next = all.filter(
          (l) =>
            l.gameId !== game.id || !l.pitchOnly || counts.some((c) => c.playerId === l.playerId),
        );
        for (const c of counts) {
          const at = next.find((l) => l.gameId === game.id && l.playerId === c.playerId);
          const pitching = cleanPitching({
            ...(at?.pitching ?? {}),
            pitches: c.pitches,
            strikes: c.strikes ?? 0,
          });
          if (at) at.pitching = pitching;
          else
            next.unshift({
              id: crypto.randomUUID(),
              playerId: c.playerId,
              gameId: game.id,
              gameDate: game.date,
              opponent: game.opponent,
              ourRuns: null,
              theirRuns: null,
              teamName: null,
              boxName: null,
              batting: cleanBatting({}),
              pitching,
              errors: 0,
              positions: [],
              pitchOnly: true,
              source: "coach",
            });
        }
        writeLocal(seasonId, next);
        setLines(next);
        return;
      }
      const { error: e } = await getBrowserSupabase().rpc("save_game_box_score", {
        p_game: game.id,
        p_lines: counts.map((c) => ({
          player_id: c.playerId,
          pitches: c.pitches,
          strikes: c.strikes ?? 0,
        })),
        p_pitch_only: true,
      });
      if (e) throw new Error(`Couldn't save the pitch counts (${e.message}).`);
      setVersion((v) => v + 1);
    },
    [signedIn, seasonId],
  );

  const clear = useCallback(
    async (gameId: string) => {
      if (!signedIn) {
        const next = readLocal(seasonId).filter((l) => l.gameId !== gameId);
        writeLocal(seasonId, next);
        setLines(next);
        return;
      }
      const { error: e } = await getBrowserSupabase().rpc("clear_game_box_score", {
        p_game: gameId,
      });
      if (e) throw new Error(`Couldn't remove the box score (${e.message}).`);
      setVersion((v) => v + 1);
    },
    [signedIn, seasonId],
  );

  return { lines, loading, error, save, savePitches, clear };
}

/** The season's GameChanger imports, newest last (for streaks). Coaches and managers only. */
export function useStatsImports(seasonId: string, enabled = true): StatImport[] {
  const { mode } = useStoreState();
  const signedIn = mode === "supabase";
  const [imports, setImports] = useState<StatImport[]>([]);
  useEffect(() => {
    if (!enabled || !seasonId || !signedIn) return;
    let current = true;
    void getBrowserSupabase()
      .from("team_stats_import")
      .select("imported_at, data")
      .eq("season_id", seasonId)
      .order("imported_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!current) return;
        setImports(
          ((data ?? []) as { imported_at: string; data: TeamStats }[])
            .map((r) => ({ importedAt: r.imported_at, data: r.data }))
            .reverse(),
        );
      });
    return () => {
      current = false;
    };
  }, [seasonId, signedIn, enabled]);
  return imports;
}
