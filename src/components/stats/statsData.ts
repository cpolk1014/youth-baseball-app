"use client";

import { useEffect, useState } from "react";
import { SYNC_EVENT, useStoreState } from "@/lib/data/store";
import type { TeamStats } from "@/lib/stats/gamechanger";
import { getBrowserSupabase } from "@/lib/supabase/client";

// A season's imported GameChanger stats: one document, replaced on every import.
// Coaches and managers only (the database enforces it). In local mode it lives in
// this browser.

export interface SavedStats {
  fileName: string;
  importedAt: string;
  data: TeamStats;
}

const localKey = (seasonId: string) => `rallycap:stats:${seasonId}`;

interface Row {
  file_name: string;
  imported_at: string;
  data: TeamStats;
}

export function useTeamStats(seasonId: string): {
  stats: SavedStats | null;
  loading: boolean;
  error: string | null;
  save: (fileName: string, data: TeamStats) => Promise<void>;
} {
  const { mode } = useStoreState();
  const signedIn = mode === "supabase";
  const [stats, setStats] = useState<SavedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    if (!signedIn) {
      try {
        const raw = window.localStorage.getItem(localKey(seasonId));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reading this device's copy
        setStats(raw ? (JSON.parse(raw) as SavedStats) : null);
      } catch {
        setStats(null);
      }
      setLoading(false);
      return;
    }
    getBrowserSupabase()
      .from("team_stats")
      .select("file_name, imported_at, data")
      .eq("season_id", seasonId)
      .maybeSingle<Row>()
      .then(({ data, error: e }) => {
        if (!current) return;
        if (e) setError(e.message);
        else {
          setError(null);
          setStats(
            data
              ? { fileName: data.file_name, importedAt: data.imported_at, data: data.data }
              : null,
          );
        }
        setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [seasonId, signedIn, version]);

  useEffect(() => {
    const onSync = () => setVersion((v) => v + 1);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  const save = async (fileName: string, data: TeamStats) => {
    const name = fileName.slice(0, 200) || "stats.csv";
    if (signedIn) {
      const { data: row, error: e } = await getBrowserSupabase()
        .from("team_stats")
        .upsert(
          { season_id: seasonId, file_name: name, data, imported_at: new Date().toISOString() },
          { onConflict: "season_id" },
        )
        .select("file_name, imported_at, data")
        .single<Row>();
      if (e || !row) throw new Error(`Couldn't save the stats (${e?.message ?? "no answer"}).`);
      setStats({ fileName: row.file_name, importedAt: row.imported_at, data: row.data });
      return;
    }
    const saved = { fileName: name, importedAt: new Date().toISOString(), data };
    try {
      window.localStorage.setItem(localKey(seasonId), JSON.stringify(saved));
    } catch {
      // Storage full or unavailable: keep it on screen for now.
    }
    setStats(saved);
  };

  return { stats, loading, error, save };
}
