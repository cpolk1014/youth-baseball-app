"use client";

import { useCallback, useEffect, useState } from "react";
import { cleanBatting, cleanPitching, type KidGame } from "@/lib/boxscore/stats";
import { SYNC_EVENT, useStoreState } from "@/lib/data/store";
import { getBrowserSupabase } from "@/lib/supabase/client";

// A kid's imported game lines. Only the kid's own parents can read or change them (the
// database enforces it). In local mode they live in this browser.

const localKey = "rallycap:kid-games";

interface Row {
  id: string;
  player_id: string | null;
  athlete_id: string | null;
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
}

const fromRow = (r: Row): KidGame => ({
  id: r.id,
  // A box score from a team that's since been deleted keeps only its athlete.
  playerId: r.player_id ?? "",
  athleteId: r.athlete_id,
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
});

function readLocal(): KidGame[] {
  try {
    return JSON.parse(window.localStorage.getItem(localKey) ?? "[]") as KidGame[];
  } catch {
    return [];
  }
}

function writeLocal(games: KidGame[]) {
  try {
    window.localStorage.setItem(localKey, JSON.stringify(games));
  } catch {
    // Full or unavailable: kept on screen for now.
  }
}

/** One of the signed-in parent's kids on one team (a kid's teams share an athleteId). */
export interface KidTeam {
  athleteId: string;
  name: string;
  playerId: string | null;
  teamId: string | null;
  teamName: string | null;
  seasonName: string | null;
}

export function useKidGames(playerIds: string[]) {
  const { mode } = useStoreState();
  const signedIn = mode === "supabase";
  const [games, setGames] = useState<KidGame[]>([]);
  const [kidTeams, setKidTeams] = useState<KidTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const key = playerIds.join(",");

  useEffect(() => {
    let current = true;
    const ids = key ? key.split(",") : [];
    if (!signedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- this device's copy
      setGames(readLocal().filter((g) => ids.includes(g.playerId)));
      setLoading(false);
      return;
    }
    if (ids.length === 0) {
      setGames([]);
      setLoading(false);
      return;
    }
    void (async () => {
      const sb = getBrowserSupabase();
      // The parent's kids on every team, so last year's teams come along.
      const teams = await sb.rpc("my_athletes");
      const rows = (
        (teams.data ?? []) as {
          athlete_id: string;
          name: string;
          player_id: string | null;
          team_id: string | null;
          team_name: string | null;
          season_name: string | null;
        }[]
      ).map((r) => ({
        athleteId: r.athlete_id,
        name: r.name,
        playerId: r.player_id,
        teamId: r.team_id,
        teamName: r.team_name,
        seasonName: r.season_name,
      }));
      const athletes = [
        ...new Set(
          rows.filter((r) => r.playerId && ids.includes(r.playerId)).map((r) => r.athleteId),
        ),
      ];
      const { data, error: e } = await sb
        .from("player_game_stat")
        .select(
          "id,player_id,athlete_id,game_id,game_date,opponent,our_runs,their_runs,team_name,box_name,batting,pitching,errors,positions",
        )
        .or(
          [
            `player_id.in.(${ids.join(",")})`,
            athletes.length ? `athlete_id.in.(${athletes.join(",")})` : null,
          ]
            .filter(Boolean)
            .join(","),
        )
        .order("game_date", { ascending: false });
      if (!current) return;
      setKidTeams(rows);
      if (e) setError(e.message);
      else {
        setError(null);
        setGames(((data ?? []) as Row[]).map(fromRow));
      }
      setLoading(false);
    })();
    return () => {
      current = false;
    };
  }, [key, signedIn, version]);

  useEffect(() => {
    const onSync = () => setVersion((v) => v + 1);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  /** Save a game (the same date and opponent replaces the earlier import). */
  const save = useCallback(
    async (g: Omit<KidGame, "id">, seasonId: string) => {
      if (!signedIn) {
        const rest = readLocal().filter(
          (x) => !(x.playerId === g.playerId && x.gameId === g.gameId),
        );
        const next = [{ ...g, id: crypto.randomUUID() }, ...rest];
        writeLocal(next);
        setGames(next.filter((x) => key.split(",").includes(x.playerId)));
        return;
      }
      const { error: e } = await getBrowserSupabase()
        .from("player_game_stat")
        .upsert(
          {
            player_id: g.playerId,
            game_id: g.gameId ?? null,
            season_id: seasonId,
            game_date: g.gameDate,
            opponent: g.opponent,
            our_runs: g.ourRuns,
            their_runs: g.theirRuns,
            team_name: g.teamName,
            box_name: g.boxName,
            batting: g.batting,
            pitching: g.pitching,
            errors: g.errors,
            positions: g.positions,
            imported_at: new Date().toISOString(),
          },
          // One box score per kid per game (the database takes the game's date and opponent).
          { onConflict: "player_id,game_id" },
        );
      if (e) throw new Error(`Couldn't save the game (${e.message}).`);
      setVersion((v) => v + 1);
    },
    [signedIn, key],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!signedIn) {
        const next = readLocal().filter((x) => x.id !== id);
        writeLocal(next);
        setGames(next.filter((x) => key.split(",").includes(x.playerId)));
        return;
      }
      const { error: e } = await getBrowserSupabase()
        .from("player_game_stat")
        .delete()
        .eq("id", id);
      if (e) throw new Error(`Couldn't remove the game (${e.message}).`);
      setVersion((v) => v + 1);
    },
    [signedIn, key],
  );

  /** "Same kid as on the Knights": join this team's player to that record. */
  const link = useCallback(async (playerId: string, athleteId: string) => {
    const { error: e } = await getBrowserSupabase().rpc("link_player_athlete", {
      p_player_id: playerId,
      p_athlete_id: athleteId,
    });
    if (e) throw new Error(e.message);
    setVersion((v) => v + 1);
  }, []);

  /** Undo a wrong join: this team's player gets its own record again. */
  const split = useCallback(async (playerId: string) => {
    const { error: e } = await getBrowserSupabase().rpc("split_player_athlete", {
      p_player_id: playerId,
    });
    if (e) throw new Error(e.message);
    setVersion((v) => v + 1);
  }, []);

  return { games, kidTeams, loading, error, save, remove, link, split };
}
