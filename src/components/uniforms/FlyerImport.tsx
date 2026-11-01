"use client";

import { useState } from "react";
import { addUniforms, newId, useStoreState } from "@/lib/data/store";
import { cleanName, type FlyerCombo, type UniformPieces } from "@/lib/uniforms";
import { UniformForm } from "./UniformForm";
import { UniformSwatches } from "./UniformSwatches";

const MAX_BYTES = 4 * 1024 * 1024;

/** Picture of the flyer → combos to check and fix → saved. */
export function FlyerImport({ teamId, onDone }: { teamId: string; onDone: () => void }) {
  const { mode } = useStoreState();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<(FlyerCombo & { keep: boolean })[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fixing, setFixing] = useState<number | null>(null);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("That picture is too big. Try one under 4 MB, or a screenshot of it.");
      return;
    }
    if (mode !== "supabase") {
      setError("Reading a flyer needs you to be signed in.");
      return;
    }
    setBusy("Reading the flyer…");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("teamId", teamId);
      const res = await fetch("/api/uniforms/read", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        combos?: FlyerCombo[];
        warnings?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Couldn't read the flyer. Try again.");
      const combos = json.combos ?? [];
      if (combos.length === 0) throw new Error(json.warnings?.[0] ?? "No uniforms found.");
      setFound(combos.map((c) => ({ ...c, keep: true })));
      setWarnings(json.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const keep = (found ?? []).filter((c) => c.keep);
    setBusy("Saving…");
    setError(null);
    try {
      await addUniforms(
        keep.map((c) => ({
          id: newId(),
          name: cleanName(c.name),
          shirt: c.shirt,
          pants: c.pants,
          hat: c.hat,
          belt: c.belt,
          socks: c.socks,
        })),
      );
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  if (found && fixing !== null) {
    const c = found[fixing]!;
    return (
      <UniformForm
        name={c.name}
        pieces={c}
        saveLabel="Done"
        onCancel={() => setFixing(null)}
        onSave={(name: string, pieces: UniformPieces) => {
          setFound(found.map((x, i) => (i === fixing ? { ...x, name, ...pieces } : x)));
          setFixing(null);
        }}
      />
    );
  }

  const keeping = found?.filter((c) => c.keep).length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      {!found && (
        <>
          <p className="text-base text-slate-700">
            Take a picture of the uniform flyer (or pick a screenshot or PDF). RallyCap reads each
            look into a combo, and you check them before they&apos;re saved.
          </p>
          <label className="flex h-14 cursor-pointer items-center justify-center rounded-xl bg-[var(--team)] text-lg font-bold text-white">
            {busy ?? "Choose the flyer"}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </>
      )}

      {found && (
        <>
          <p className="text-base font-semibold">
            Found {found.length} combo{found.length === 1 ? "" : "s"}. Tap one to fix it.
          </p>
          {warnings.length > 0 && (
            <ul className="rounded-xl bg-amber-50 p-3 text-base text-amber-950">
              {warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
          <ul className="flex flex-col gap-2">
            {found.map((c, i) => (
              <li
                key={i}
                className={`flex items-start gap-3 rounded-xl border-2 p-3 ${
                  c.keep ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50 opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={c.keep}
                  aria-label={`Keep ${c.name}`}
                  onChange={() =>
                    setFound(found.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))
                  }
                  className="mt-1 size-6 shrink-0"
                />
                <button
                  onClick={() => setFixing(i)}
                  className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                >
                  <span className="text-lg font-bold">{c.name}</span>
                  <UniformSwatches pieces={c} />
                  <span className="text-sm font-semibold text-[var(--team)] underline">Fix</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setFound(null);
                setWarnings([]);
              }}
              className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold text-slate-800 active:bg-slate-100"
            >
              Start over
            </button>
            <button
              onClick={() => void save()}
              disabled={keeping === 0 || busy !== null}
              className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
            >
              {busy ?? `Add ${keeping} combo${keeping === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
