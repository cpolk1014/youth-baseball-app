"use client";

// Gameday PA data: walk-ups and team sounds (Supabase when signed in, this device in
// local mode), and their audio files, kept on the phone so the PA works with no signal.
import { useCallback, useEffect, useState } from "react";
import { useStoreState } from "@/lib/data/store";
import type { GenerationKind } from "@/lib/pa/limits";
import type { LyricOption } from "@/lib/pa/lyrics";
import type { SoundCategory, TeamSound, Walkup } from "@/lib/pa/types";
import { getBrowserSupabase } from "@/lib/supabase/client";

const BUCKET = "pa-audio";

// ── Audio files on this device (IndexedDB) ──

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("rallycap-pa", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("audio");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open storage on this device."));
  });
  return dbPromise;
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const store = (await db()).transaction("audio", mode).objectStore("audio");
  return await new Promise<T>((resolve, reject) => {
    const req = fn(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error("Storage on this device failed."));
  });
}

const cached = (path: string) => idb<Blob | undefined>("readonly", (s) => s.get(path));
const keep = (path: string, blob: Blob) => idb<IDBValidKey>("readwrite", (s) => s.put(blob, path));
const forget = (path: string) => idb<undefined>("readwrite", (s) => s.delete(path));

/** Is this file already on the phone? */
export async function isOnDevice(path: string): Promise<boolean> {
  try {
    return (await cached(path)) !== undefined;
  } catch {
    return false;
  }
}

/** A file's audio: from this phone if it's there, otherwise downloaded and kept. */
export async function getAudio(path: string): Promise<ArrayBuffer> {
  const local = await cached(path).catch(() => undefined);
  if (local) return await local.arrayBuffer();
  const { data, error } = await getBrowserSupabase().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("Couldn't download a sound. Check your signal.");
  await keep(path, data).catch(() => undefined);
  return await data.arrayBuffer();
}

async function saveAudio(path: string, blob: Blob, signedIn: boolean): Promise<void> {
  if (signedIn) {
    const { error } = await getBrowserSupabase()
      .storage.from(BUCKET)
      .upload(path, blob, { contentType: blob.type || "audio/mpeg" });
    if (error) throw new Error(`Couldn't save the sound (${error.message}).`);
  }
  await keep(path, blob);
}

async function removeAudio(paths: (string | null | undefined)[], signedIn: boolean) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  await Promise.all(list.map((p) => forget(p).catch(() => undefined)));
  if (signedIn) {
    // An old file left behind is harmless; don't bother anyone about it.
    await getBrowserSupabase()
      .storage.from(BUCKET)
      .remove(list)
      .catch(() => undefined);
  }
}

// ── Rows ──

interface WalkupRow {
  player_id: string;
  song_path: string;
  song_source: "ai" | "upload";
  song_prompt: string | null;
  volume: number;
  announce: boolean;
  announce_mode: "over" | "before";
  name_spoken: string;
  number_spoken: string;
  script: string;
  announce_path: string | null;
  status: "pending" | "approved";
  updated_at: string;
}

const fromRow = (r: WalkupRow): Walkup => ({
  playerId: r.player_id,
  songPath: r.song_path,
  songSource: r.song_source,
  songPrompt: r.song_prompt,
  volume: r.volume,
  announce: r.announce,
  announceMode: r.announce_mode,
  nameSpoken: r.name_spoken,
  numberSpoken: r.number_spoken,
  script: r.script,
  announcePath: r.announce_path,
  status: r.status,
  updatedAt: r.updated_at,
});

const toRow = (w: Walkup): Omit<WalkupRow, "updated_at"> => ({
  player_id: w.playerId,
  song_path: w.songPath,
  song_source: w.songSource,
  song_prompt: w.songPrompt,
  volume: w.volume,
  announce: w.announce,
  announce_mode: w.announceMode,
  name_spoken: w.nameSpoken,
  number_spoken: w.numberSpoken,
  script: w.script,
  announce_path: w.announcePath,
  status: w.status,
});

interface PaState {
  walkups: Walkup[];
  sounds: TeamSound[];
}

const listKey = (teamId: string) => `rallycap:pa:${teamId}`;

function readList(teamId: string): PaState | null {
  try {
    const raw = window.localStorage.getItem(listKey(teamId));
    return raw ? (JSON.parse(raw) as PaState) : null;
  } catch {
    return null;
  }
}

function writeList(teamId: string, s: PaState) {
  try {
    window.localStorage.setItem(listKey(teamId), JSON.stringify(s));
  } catch {
    // Full or unavailable: the PA still works while the page is open.
  }
}

async function loadRemote(teamId: string): Promise<PaState> {
  const supabase = getBrowserSupabase();
  const [w, s] = await Promise.all([
    supabase.from("walkup").select("*, player!inner(team_id)").eq("player.team_id", teamId),
    supabase
      .from("pa_sound")
      .select("id, category, label, path, source")
      .eq("team_id", teamId)
      .order("created_at"),
  ]);
  if (w.error || s.error) throw new Error((w.error ?? s.error)!.message);
  return {
    walkups: (w.data as WalkupRow[]).map(fromRow),
    sounds: (s.data ?? []) as TeamSound[],
  };
}

export interface PaData extends PaState {
  loading: boolean;
  /** Loaded from this phone because the network didn't answer. */
  offline: boolean;
  error: string | null;
  signedIn: boolean;
  saveWalkup: (
    w: Walkup,
    files: { song?: Blob; announce?: Blob },
    replaced: Walkup | null,
  ) => Promise<void>;
  removeWalkup: (w: Walkup) => Promise<void>;
  approve: (w: Walkup) => Promise<void>;
  addSound: (s: Omit<TeamSound, "id" | "path">, file: Blob) => Promise<void>;
  removeSound: (s: TeamSound) => Promise<void>;
  reload: () => void;
}

/** The team's walk-ups and sounds; also kept on this phone for when there's no signal. */
export function usePa(teamId: string): PaData {
  const { mode } = useStoreState();
  const signedIn = mode === "supabase";
  const [state, setState] = useState<PaState>({ walkups: [], sounds: [] });
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    const saved = readList(teamId);
    if (!signedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading this device's copy
      setState(saved ?? { walkups: [], sounds: [] });
      setLoading(false);
      return;
    }
    loadRemote(teamId).then(
      (s) => {
        if (!current) return;
        setState(s);
        writeList(teamId, s);
        setOffline(false);
        setLoading(false);
      },
      (e: unknown) => {
        if (!current) return;
        if (saved) {
          setState(saved);
          setOffline(true);
        } else setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
    return () => {
      current = false;
    };
  }, [teamId, signedIn, version]);

  const commit = useCallback(
    (fn: (s: PaState) => PaState) =>
      setState((s) => {
        const next = fn(s);
        writeList(teamId, next);
        return next;
      }),
    [teamId],
  );

  const saveWalkup: PaData["saveWalkup"] = async (w, files, replaced) => {
    if (files.song) await saveAudio(w.songPath, files.song, signedIn);
    if (files.announce && w.announcePath) await saveAudio(w.announcePath, files.announce, signedIn);
    let saved = { ...w, updatedAt: new Date().toISOString() };
    if (signedIn) {
      const { data, error: e } = await getBrowserSupabase()
        .from("walkup")
        .upsert(toRow(w), { onConflict: "player_id" })
        .select()
        .single<WalkupRow>();
      if (e || !data) throw new Error(`Couldn't save the walk-up (${e?.message ?? "no answer"}).`);
      saved = fromRow(data); // the database decides whether it waits for a coach
    }
    commit((s) => ({
      ...s,
      walkups: [...s.walkups.filter((x) => x.playerId !== w.playerId), saved],
    }));
    if (replaced) {
      await removeAudio(
        [
          replaced.songPath !== w.songPath ? replaced.songPath : null,
          replaced.announcePath !== w.announcePath ? replaced.announcePath : null,
        ],
        signedIn,
      );
    }
  };

  const removeWalkup: PaData["removeWalkup"] = async (w) => {
    if (signedIn) {
      const { error: e } = await getBrowserSupabase()
        .from("walkup")
        .delete()
        .eq("player_id", w.playerId);
      if (e) throw new Error(`Couldn't remove it (${e.message}).`);
    }
    commit((s) => ({ ...s, walkups: s.walkups.filter((x) => x.playerId !== w.playerId) }));
    await removeAudio([w.songPath, w.announcePath], signedIn);
  };

  const approve: PaData["approve"] = async (w) => {
    let saved: Walkup = { ...w, status: "approved" };
    if (signedIn) {
      const { data, error: e } = await getBrowserSupabase()
        .from("walkup")
        .update({ status: "approved" })
        .eq("player_id", w.playerId)
        .select()
        .single<WalkupRow>();
      if (e || !data) throw new Error(`Couldn't approve it (${e?.message ?? "no answer"}).`);
      saved = fromRow(data);
    }
    commit((s) => ({
      ...s,
      walkups: s.walkups.map((x) => (x.playerId === w.playerId ? saved : x)),
    }));
  };

  const addSound: PaData["addSound"] = async (s, file) => {
    const id = crypto.randomUUID();
    const ext = file.type === "audio/wav" ? "wav" : "mp3";
    const sound: TeamSound = { ...s, id, path: `${teamId}/sounds/${id}.${ext}` };
    await saveAudio(sound.path, file, signedIn);
    if (signedIn) {
      const { error: e } = await getBrowserSupabase().from("pa_sound").insert({
        id,
        team_id: teamId,
        category: s.category,
        label: s.label,
        path: sound.path,
        source: s.source,
      });
      if (e) throw new Error(`Couldn't add the sound (${e.message}).`);
    }
    commit((st) => ({ ...st, sounds: [...st.sounds, sound] }));
  };

  const removeSound: PaData["removeSound"] = async (s) => {
    if (signedIn) {
      const { error: e } = await getBrowserSupabase().from("pa_sound").delete().eq("id", s.id);
      if (e) throw new Error(`Couldn't remove it (${e.message}).`);
    }
    commit((st) => ({ ...st, sounds: st.sounds.filter((x) => x.id !== s.id) }));
    await removeAudio([s.path], signedIn);
  };

  return {
    ...state,
    loading,
    offline,
    error,
    signedIn,
    saveWalkup,
    removeWalkup,
    approve,
    addSound,
    removeSound,
    reload: () => setVersion((v) => v + 1),
  };
}

/** Where a kid's walk-up files go. */
export function walkupPath(
  teamId: string,
  playerId: string,
  file: "song" | "announce",
  ext: string,
) {
  return `${teamId}/walkups/${playerId}/${file}-${crypto.randomUUID()}.${ext}`;
}

/** Ask the server's AI to make a clip; returns MP3 bytes. */
export async function generate(
  kind: GenerationKind,
  payload: Record<string, unknown>,
): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch("/api/pa/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...payload }),
    });
  } catch {
    throw new Error("No signal. AI clips need the internet; saved ones play without it.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "The AI couldn't make it this time. Try again.");
  }
  return new Blob([await res.arrayBuffer()], { type: "audio/mpeg" });
}

/** Download every file the PA needs onto this phone; reports progress. */
export async function getReady(
  paths: string[],
  onProgress: (done: number, total: number) => void,
): Promise<{ ready: number; failed: number }> {
  let ready = 0;
  let failed = 0;
  onProgress(0, paths.length);
  for (const p of paths) {
    try {
      if (!(await isOnDevice(p))) await getAudio(p);
      ready++;
    } catch {
      failed++;
    }
    onProgress(ready + failed, paths.length);
  }
  return { ready, failed };
}

export type { SoundCategory };

/** Ask Claude for three lyric options for a kid's walk-up. */
export async function writeLyrics(payload: Record<string, unknown>): Promise<LyricOption[]> {
  let res: Response;
  try {
    res = await fetch("/api/pa/lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("No signal. Writing lyrics needs the internet.");
  }
  const body = (await res.json().catch(() => null)) as {
    options?: LyricOption[];
    error?: string;
  } | null;
  if (!res.ok || !body?.options) {
    throw new Error(body?.error ?? "Couldn't write lyrics this time. Try again.");
  }
  return body.options;
}
