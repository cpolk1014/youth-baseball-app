"use client";

import { useEffect, useState } from "react";
import { TEAM_SWATCHES, readableOnWhite, suggestPair } from "@/lib/branding/color";
import type { ClubLook } from "@/lib/data/club-backend";
import { newId } from "@/lib/data/store";
import { cleanPieces, type UniformCombo } from "@/lib/uniforms";
import { Loading } from "../AppShell";
import { paletteFromPicture, squareLogo } from "../picture";
import { Sheet } from "../Sheet";
import { TeamBadge } from "../TeamBadge";
import { Swatches } from "../TeamLookScreen";
import { FlyerImport } from "../uniforms/FlyerImport";
import { UniformForm } from "../uniforms/UniformForm";
import { UniformSwatches } from "../uniforms/UniformSwatches";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const backend = () => import("@/lib/data/club-backend");

/** The club's logo, colors and uniform combos; club teams can use all of them. */
export function ClubLookTab({ clubId }: { clubId: string }) {
  const [look, setLook] = useState<ClubLook | null>(null);
  const [combos, setCombos] = useState<UniformCombo[]>([]);
  const [main, setMain] = useState<string | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [slot, setSlot] = useState<"main" | "accent">("main");
  const [found, setFound] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<UniformCombo | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    let current = true;
    void (async () => {
      const m = await backend();
      const [l, u] = await Promise.all([m.clubLook(clubId), m.clubUniforms(clubId)]);
      if (!current) return;
      setLook(l);
      setCombos(u);
    })().catch((e: unknown) => current && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      current = false;
    };
  }, [clubId]);

  if (!look) return error ? <p className="text-base text-red-700">{error}</p> : <Loading />;
  const colors = {
    main: main ?? look.colors[0] ?? TEAM_SWATCHES[0]!.hex,
    accent: accent ?? look.colors[1] ?? TEAM_SWATCHES[1]!.hex,
  };
  const changed = main !== null || accent !== null;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setSaved(false);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const uploadLogo = (file: File) =>
    run("Uploading logo…", async () => {
      const palette = await paletteFromPicture(file);
      setFound(palette);
      const pair = suggestPair(palette);
      const m = await backend();
      const path = await m.uploadClubLogo(clubId, await squareLogo(file));
      const next = pair ? [pair.main, pair.accent] : [colors.main, colors.accent];
      await m.saveClubLook(clubId, next, path);
      if (look.logoPath) await m.removeClubLogo(look.logoPath).catch(() => undefined);
      setLook({ ...look, logoPath: path, colors: next });
      setMain(null);
      setAccent(null);
      setSaved(true);
    });

  const saveColors = () =>
    run("Saving…", async () => {
      const next = [colors.main, colors.accent];
      await (await backend()).saveClubLook(clubId, next, look.logoPath);
      setLook({ ...look, colors: next });
      setMain(null);
      setAccent(null);
      setSaved(true);
    });

  const saveCombos = async (list: UniformCombo[]) => {
    await (await backend()).saveClubUniforms(clubId, list);
    setCombos((cur) => [...cur.filter((c) => !list.some((x) => x.id === c.id)), ...list]);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border-2 border-slate-200 bg-white p-4">
        <h2 className={heading}>Logo &amp; colors</h2>
        <p className="mb-3 text-base text-slate-700">
          Club teams can use these on their Team colors &amp; logo page with one tap.
        </p>
        <div className="mb-4 flex items-center gap-3">
          <TeamBadge
            name={look.name}
            colors={[colors.main, colors.accent]}
            logoPath={look.logoPath}
            size={64}
          />
          <label className="flex h-12 cursor-pointer items-center rounded-xl border-2 border-slate-400 bg-white px-4 text-base font-bold active:bg-slate-100">
            {look.logoPath ? "Change logo" : "Upload logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadLogo(f);
              }}
            />
          </label>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["main", "accent"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSlot(s)}
              aria-pressed={slot === s}
              className={`flex h-14 items-center gap-2 rounded-xl border-2 px-3 text-base font-bold ${
                slot === s ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-300"
              }`}
            >
              <span
                className="size-8 rounded-lg border-2 border-slate-300"
                style={{ background: s === "main" ? colors.main : colors.accent }}
              />
              {s === "main" ? "Main" : "Accent"}
            </button>
          ))}
        </div>
        {found.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 text-sm font-semibold text-slate-700">From the logo</p>
            <Swatches
              colors={found}
              selected={slot === "main" ? colors.main : colors.accent}
              onPick={(hex) => (slot === "main" ? setMain(hex) : setAccent(hex))}
            />
          </div>
        )}
        <Swatches
          colors={TEAM_SWATCHES.map((s) => s.hex)}
          names={TEAM_SWATCHES.map((s) => s.name)}
          selected={slot === "main" ? colors.main : colors.accent}
          onPick={(hex) => (slot === "main" ? setMain(hex) : setAccent(hex))}
        />
        {readableOnWhite(colors.main) !== colors.main.toLowerCase() && (
          <p className="mt-2 text-sm text-slate-600">
            A light main color is darkened a little on teams&apos; screens so text stays readable.
          </p>
        )}
        {changed && (
          <button
            onClick={() => void saveColors()}
            disabled={busy !== null}
            className="mt-3 h-14 w-full rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
          >
            {busy ?? "Save colors"}
          </button>
        )}
        {busy && !changed && <p className="mt-2 text-base">{busy}</p>}
        {saved && (
          <p role="status" className="mt-2 text-base font-semibold text-green-800">
            Saved.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-base font-semibold text-red-700">
            {error}
          </p>
        )}
      </section>

      <section>
        <h2 className={heading}>Uniform combos</h2>
        <p className="mb-3 text-base text-slate-700">
          These show up for every club team when they pick a game&apos;s uniform. Teams can still
          add their own.
        </p>
        <button
          onClick={() => setReading(true)}
          className="mb-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-[var(--team)] bg-white text-lg font-bold text-[var(--team)] active:bg-slate-100"
        >
          <span aria-hidden="true">📷</span> Build combos from the club flyer
        </button>
        <ul className="grid gap-3 md:grid-cols-2">
          {combos.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => setEditing(u)}
                className="flex h-full w-full flex-col gap-2 rounded-xl border-2 border-slate-200 bg-white p-3 text-left active:bg-slate-50"
              >
                <span className="text-lg font-bold">{u.name}</span>
                <UniformSwatches pieces={u} />
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={() => setEditing({ id: newId(), name: "", ...cleanPieces({}) })}
          className="mt-3 h-14 w-full rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
        >
          + Add combo
        </button>
      </section>

      <Sheet
        open={editing !== null}
        title={
          editing && combos.some((c) => c.id === editing.id) ? "Edit club combo" : "New club combo"
        }
        onClose={() => setEditing(null)}
      >
        {editing && (
          <UniformForm
            key={editing.id}
            name={editing.name}
            pieces={editing}
            saveLabel="Save combo"
            onCancel={() => setEditing(null)}
            onSave={(name, pieces) => {
              const combo = { id: editing.id, name, ...pieces };
              setEditing(null);
              void run("Saving…", () => saveCombos([combo]));
            }}
            onDelete={
              combos.some((c) => c.id === editing.id)
                ? () => {
                    const id = editing.id;
                    setEditing(null);
                    void run("Removing…", async () => {
                      await (await backend()).deleteClubUniform(id);
                      setCombos((cur) => cur.filter((c) => c.id !== id));
                    });
                  }
                : undefined
            }
          />
        )}
      </Sheet>
      <Sheet
        open={reading}
        title="Build combos from the club flyer"
        onClose={() => setReading(false)}
      >
        {reading && (
          <FlyerImport clubId={clubId} onSave={saveCombos} onDone={() => setReading(false)} />
        )}
      </Sheet>
    </div>
  );
}
