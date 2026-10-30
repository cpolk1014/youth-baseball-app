"use client";

import { useState, type CSSProperties } from "react";
import { permissionsFor } from "@/lib/data/permissions";
import { removeLogo, saveTeamLook, uploadLogo, useAppData } from "@/lib/data/store";
import { TEAM_SWATCHES, readableOnWhite, suggestPair } from "@/lib/branding/color";
import { teamColors, themeVars } from "@/lib/branding/theme";
import { AppShell, Loading } from "./AppShell";
import { TeamBadge } from "./TeamBadge";
import { paletteFromPicture, squareLogo } from "./picture";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
type Slot = "main" | "accent";

/** Coaches pick the team's two colors (or pull them from a picture) and upload a logo. */
export function TeamLookScreen() {
  const data = useAppData();
  const start = teamColors(data?.team.colors);
  const [main, setMain] = useState<string | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [logo, setLogo] = useState<{ path: string | null; changed: boolean } | null>(null);
  const [slot, setSlot] = useState<Slot>("main");
  const [found, setFound] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!data) {
    return (
      <AppShell title="Team colors & logo" tab="roster">
        <Loading />
      </AppShell>
    );
  }
  const canEdit = permissionsFor(data.me.role, data.team.optionedAt !== null).editTeam;
  const colors = { main: main ?? start.main, accent: accent ?? start.accent };
  const logoPath = logo ? logo.path : (data.team.logoPath ?? null);
  const dirty = main !== null || accent !== null || logo?.changed === true;
  const pick = (hex: string) => {
    if (slot === "main") setMain(hex);
    else setAccent(hex);
    setSaved(false);
  };
  const darkened = readableOnWhite(colors.main) !== colors.main.toLowerCase();

  const fromPicture = async (file: File | undefined, alsoLogo: boolean) => {
    if (!file) return;
    setError(null);
    setBusy(alsoLogo ? "Uploading logo…" : "Reading colors…");
    try {
      const palette = await paletteFromPicture(file);
      setFound(palette);
      // Main and accent from the picture's two real colors; the coach can change either.
      const pair = suggestPair(palette);
      if (pair) {
        setMain(pair.main);
        setAccent(pair.accent);
      }
      if (alsoLogo) {
        const path = await uploadLogo(await squareLogo(file));
        setLogo({ path, changed: true });
      }
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't use that picture.");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const old = data.team.logoPath ?? null;
    saveTeamLook([colors.main, colors.accent], logoPath);
    if (old && old !== logoPath) await removeLogo(old);
    setMain(null);
    setAccent(null);
    setLogo(null);
    setSaved(true);
  };

  const preview = themeVars([colors.main, colors.accent]) as CSSProperties;

  return (
    <AppShell title="Team colors & logo" subtitle={data.team.name} backHref="/roster" tab="roster">
      {!canEdit ? (
        <p className="text-lg">Coaches and managers set the team&apos;s colors and logo.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <section style={preview} aria-label="Preview">
            <h2 className={heading}>Preview</h2>
            <div className="overflow-hidden rounded-xl border-2 border-slate-200 bg-white">
              <div className="flex items-center gap-3 border-b-4 border-[var(--team-accent)] bg-[var(--team)] px-3 py-2 text-white">
                <TeamBadge
                  name={data.team.name}
                  colors={[colors.main, colors.accent]}
                  logoPath={logoPath}
                  size={40}
                />
                <span className="min-w-0">
                  <span className="block truncate text-lg font-bold">{data.team.name}</span>
                  <span className="block text-sm text-white/80">8–3 · next game Saturday</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 p-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-[var(--team)] text-lg font-bold text-white">
                  12
                </span>
                <span className="rounded-lg bg-[var(--team)] px-4 py-2 text-base font-bold text-white">
                  Auto-fill
                </span>
                <span className="rounded-lg bg-[var(--team-accent)] px-3 py-2 text-sm font-bold text-[var(--team-accent-ink)]">
                  Next game
                </span>
              </div>
            </div>
            {darkened && (
              <p className="mt-2 text-sm text-slate-600">
                Your main color is a little light for white text outdoors, so buttons and bars use a
                slightly darker shade of it.
              </p>
            )}
          </section>

          <section>
            <h2 className={heading}>Logo</h2>
            <div className="flex items-center gap-4">
              <TeamBadge
                name={data.team.name}
                colors={[colors.main, colors.accent]}
                logoPath={logoPath}
                size={80}
              />
              <div className="flex flex-col gap-2">
                <label className="inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-[var(--team)] px-4 text-base font-bold text-white active:bg-[var(--team-press)]">
                  {logoPath ? "Change logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      void fromPicture(e.target.files?.[0], true);
                      e.target.value = "";
                    }}
                  />
                </label>
                {logoPath && (
                  <button
                    onClick={() => {
                      setLogo({ path: null, changed: true });
                      setSaved(false);
                    }}
                    className="h-10 text-base font-semibold text-red-700 underline"
                  >
                    Remove logo
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              A square picture works best. Uploading a logo also suggests colors from it.
            </p>
          </section>

          <section>
            <h2 className={heading}>Colors</h2>
            <div role="tablist" className="mb-3 grid grid-cols-2 gap-2">
              {(["main", "accent"] as const).map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={slot === s}
                  onClick={() => setSlot(s)}
                  className={`flex h-14 items-center gap-3 rounded-xl border-2 px-3 text-left ${
                    slot === s ? "border-slate-900 bg-white" : "border-slate-300 bg-white"
                  }`}
                >
                  <span
                    className="size-8 shrink-0 rounded-md border border-slate-300"
                    style={{ background: s === "main" ? colors.main : colors.accent }}
                  />
                  <span>
                    <span className="block text-base font-bold">
                      {s === "main" ? "Main" : "Accent"}
                    </span>
                    <span className="block text-xs text-slate-600">
                      {slot === s ? "Tap a color below" : "Tap to change"}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <label className="mb-3 flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-400 bg-white text-base font-bold active:bg-slate-50">
              <span aria-hidden="true">🎨</span> Get colors from a picture
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  void fromPicture(e.target.files?.[0], false);
                  e.target.value = "";
                }}
              />
            </label>
            {found.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-sm font-semibold text-slate-700">From your picture</p>
                <Swatches
                  colors={found}
                  selected={slot === "main" ? colors.main : colors.accent}
                  onPick={pick}
                />
              </div>
            )}

            <p className="mb-1 text-sm font-semibold text-slate-700">Team colors</p>
            <Swatches
              colors={TEAM_SWATCHES.map((s) => s.hex)}
              names={TEAM_SWATCHES.map((s) => s.name)}
              selected={slot === "main" ? colors.main : colors.accent}
              onPick={pick}
            />
            <label className="mt-3 flex items-center gap-3 text-base font-semibold">
              Exact color
              <input
                type="color"
                value={slot === "main" ? colors.main : colors.accent}
                onChange={(e) => pick(e.target.value)}
                className="h-11 w-16 cursor-pointer rounded-lg border-2 border-slate-300 bg-white"
              />
            </label>
          </section>

          {busy && <p className="text-base font-semibold text-slate-700">{busy}</p>}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800"
            >
              {error}
            </p>
          )}
          {saved && !dirty && (
            <p
              role="status"
              className="rounded-xl bg-green-50 p-3 text-base font-semibold text-green-900"
            >
              Saved. The whole team sees the new look.
            </p>
          )}
          <div className="sticky bottom-0 -mx-4 bg-[var(--background)] px-4 pt-2 pb-3 md:-mx-6 md:px-6">
            <button
              onClick={() => void save()}
              disabled={!dirty || busy !== null}
              className="h-14 w-full rounded-xl bg-green-700 text-lg font-bold text-white active:bg-green-800 disabled:opacity-40"
            >
              Save team look
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Swatches({
  colors,
  names,
  selected,
  onPick,
}: {
  colors: string[];
  names?: string[];
  selected: string;
  onPick: (hex: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((hex, i) => {
        const on = hex.toLowerCase() === selected.toLowerCase();
        return (
          <button
            key={hex}
            onClick={() => onPick(hex)}
            aria-label={names?.[i] ?? hex}
            aria-pressed={on}
            title={names?.[i] ?? hex}
            className={`size-12 rounded-xl border-2 ${on ? "border-slate-900 ring-2 ring-slate-900 ring-offset-2" : "border-slate-300"}`}
            style={{ background: hex }}
          />
        );
      })}
    </div>
  );
}
