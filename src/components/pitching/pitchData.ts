"use client";

import { useCallback, useEffect, useState } from "react";
import { SYNC_EVENT, useStoreState } from "@/lib/data/store";
import type { PitchAges, PitchSession, SessionKind } from "@/lib/pitching/rest";
import type { CoachCount, Dismissal } from "@/lib/pitching/review";
import { getBrowserSupabase } from "@/lib/supabase/client";

// A kid's pitch log: sessions, the coach's counts the parent said no to, and which Pitch
// Smart ages to use. Only the kid's linked parents (the database enforces it). In local
// mode it lives in this browser.

interface Row {
  id: string;
  kind: SessionKind;
  session_date: string;
  pitches: number;
  strikes: number | null;
  game_id: string | null;
  stat_id: string | null;
  label: string | null;
}

const fromRow = (r: Row): PitchSession => ({
  id: r.id,
  kind: r.kind,
  date: r.session_date,
  pitches: r.pitches,
  strikes: r.strikes,
  gameId: r.game_id,
  statId: r.stat_id,
  label: r.label,
});

export type NewSession = Omit<PitchSession, "id">;

interface LocalLog {
  sessions: PitchSession[];
  dismissals: Dismissal[];
  ages: PitchAges | null;
}
const localKey = (athleteId: string) => `rallycap:pitch:${athleteId}`;
function readLocal(athleteId: string): LocalLog {
  try {
    const raw = window.localStorage.getItem(localKey(athleteId));
    if (raw) return JSON.parse(raw) as LocalLog;
  } catch {
    // fall through
  }
  return { sessions: [], dismissals: [], ages: null };
}
function writeLocal(athleteId: string, log: LocalLog) {
  try {
    window.localStorage.setItem(localKey(athleteId), JSON.stringify(log));
  } catch {
    // Full or unavailable: kept on screen for now.
  }
}

export function usePitchLog(athleteId: string | null) {
  const { mode } = useStoreState();
  const signedIn = mode === "supabase";
  const [log, setLog] = useState<LocalLog>({ sessions: [], dismissals: [], ages: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    if (!athleteId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to load
      setLoading(false);
      return;
    }
    if (!signedIn) {
      setLog(readLocal(athleteId));
      setLoading(false);
      return;
    }
    void (async () => {
      const sb = getBrowserSupabase();
      const [s, d, a] = await Promise.all([
        sb
          .from("pitch_session")
          .select("id,kind,session_date,pitches,strikes,game_id,stat_id,label")
          .eq("athlete_id", athleteId)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false }),
        sb.from("pitch_dismissal").select("stat_id,pitches").eq("athlete_id", athleteId),
        sb.from("athlete").select("pitch_ages").eq("id", athleteId).maybeSingle(),
      ]);
      if (!current) return;
      if (s.error) setError(s.error.message);
      else setError(null);
      setLog({
        sessions: ((s.data ?? []) as Row[]).map(fromRow),
        dismissals: ((d.data ?? []) as { stat_id: string; pitches: number }[]).map((r) => ({
          statId: r.stat_id,
          pitches: r.pitches,
        })),
        ages: ((a.data as { pitch_ages: PitchAges | null } | null)?.pitch_ages ?? null) || null,
      });
      setLoading(false);
    })();
    return () => {
      current = false;
    };
  }, [athleteId, signedIn, version]);

  useEffect(() => {
    const onSync = () => setVersion((v) => v + 1);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  const local = useCallback(
    (change: (l: LocalLog) => LocalLog) => {
      if (!athleteId) return;
      const next = change(readLocal(athleteId));
      writeLocal(athleteId, next);
      setLog(next);
    },
    [athleteId],
  );

  const toRow = (s: Partial<NewSession>) => ({
    ...(s.kind !== undefined ? { kind: s.kind } : {}),
    ...(s.date !== undefined ? { session_date: s.date } : {}),
    ...(s.pitches !== undefined ? { pitches: s.pitches } : {}),
    ...(s.strikes !== undefined ? { strikes: s.strikes } : {}),
    ...(s.gameId !== undefined ? { game_id: s.gameId } : {}),
    ...(s.statId !== undefined ? { stat_id: s.statId } : {}),
    ...(s.label !== undefined ? { label: s.label } : {}),
  });

  const add = useCallback(
    async (s: NewSession) => {
      if (!athleteId) return;
      if (!signedIn) {
        local((l) => ({ ...l, sessions: [{ ...s, id: crypto.randomUUID() }, ...l.sessions] }));
        return;
      }
      const { error: e } = await getBrowserSupabase()
        .from("pitch_session")
        .insert({ athlete_id: athleteId, ...toRow(s) });
      if (e) throw new Error(`Couldn't save it (${e.message}).`);
      setVersion((v) => v + 1);
    },
    [athleteId, signedIn, local],
  );

  const update = useCallback(
    async (id: string, s: Partial<NewSession>) => {
      if (!signedIn) {
        local((l) => ({
          ...l,
          sessions: l.sessions.map((x) => (x.id === id ? { ...x, ...s } : x)),
        }));
        return;
      }
      const { error: e } = await getBrowserSupabase()
        .from("pitch_session")
        .update(toRow(s))
        .eq("id", id);
      if (e) throw new Error(`Couldn't save it (${e.message}).`);
      setVersion((v) => v + 1);
    },
    [signedIn, local],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!signedIn) {
        local((l) => ({ ...l, sessions: l.sessions.filter((x) => x.id !== id) }));
        return;
      }
      const { error: e } = await getBrowserSupabase().from("pitch_session").delete().eq("id", id);
      if (e) throw new Error(`Couldn't remove it (${e.message}).`);
      setVersion((v) => v + 1);
    },
    [signedIn, local],
  );

  /** Say no to a coach's count (it comes back if the coach changes it). */
  const dismiss = useCallback(
    async (c: CoachCount) => {
      if (!athleteId) return;
      if (!signedIn) {
        local((l) => ({
          ...l,
          dismissals: [
            ...l.dismissals.filter((d) => d.statId !== c.statId),
            { statId: c.statId, pitches: c.pitches },
          ],
        }));
        return;
      }
      const { error: e } = await getBrowserSupabase()
        .from("pitch_dismissal")
        .upsert(
          { stat_id: c.statId, athlete_id: athleteId, pitches: c.pitches },
          { onConflict: "stat_id" },
        );
      if (e) throw new Error(`Couldn't save it (${e.message}).`);
      setVersion((v) => v + 1);
    },
    [athleteId, signedIn, local],
  );

  const setAges = useCallback(
    async (ages: PitchAges | null) => {
      if (!athleteId) return;
      if (!signedIn) {
        local((l) => ({ ...l, ages }));
        return;
      }
      const { error: e } = await getBrowserSupabase().rpc("set_pitch_ages", {
        p_athlete: athleteId,
        p_ages: ages,
      });
      if (e) throw new Error(e.message);
      setVersion((v) => v + 1);
    },
    [athleteId, signedIn, local],
  );

  return { ...log, loading, error, add, update, remove, dismiss, setAges };
}
