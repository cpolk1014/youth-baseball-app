"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { formatGameDate, placeLabel, splitGames } from "@/lib/data/game";
import { useAppData, useStoreState } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import { PLAYS } from "@/lib/plays/library";
import { NavIcon, type IconName } from "./NavIcon";
import { GAME_DAY, HOME, TEAM, settingsLinks, visibleTabs } from "./nav";

export interface PaletteState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** "⌘K" on a Mac, "Ctrl K" elsewhere. */
  keyHint: string;
}

/** ⌘K / Ctrl+K (or "/" outside a text box) opens search, anywhere in the app. */
export function useCommandPalette(): PaletteState {
  const [isOpen, setOpen] = useState(false);
  const [keyHint, setKeyHint] = useState("⌘K");
  const toggle = useEffectEvent(() => setOpen((o) => !o));
  const show = useEffectEvent(() => setOpen(true));
  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- this device's keyboard
      setKeyHint("Ctrl K");
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { isOpen, open: () => setOpen(true), close: () => setOpen(false), keyHint };
}

interface Result {
  key: string;
  group: string;
  label: string;
  sub?: string;
  href: string;
  icon: IconName;
}

const PER_GROUP = 6;

/** Everything search can jump to: pages, games, players, practices and plays. */
export function searchResults(data: AppData | null, signedIn: boolean, query: string): Result[] {
  const q = query.trim().toLowerCase();
  const hit = (...texts: (string | null | undefined)[]) =>
    !q || texts.some((t) => t?.toLowerCase().includes(q));
  const pages: Result[] = [
    ...(data ? [HOME] : []),
    ...visibleTabs([...GAME_DAY, ...TEAM], data),
  ].map((t) => ({ key: t.href, group: "Pages", label: t.label, href: t.href, icon: t.icon }));
  for (const x of settingsLinks(data, signedIn)) {
    pages.push({ key: x.href, group: "Pages", label: x.label, href: x.href, icon: x.icon });
  }
  if (signedIn) {
    pages.push(
      { key: "/profile", group: "Pages", label: "My profile", href: "/profile", icon: "player" },
      { key: "/my-teams", group: "Pages", label: "My teams", href: "/my-teams", icon: "roster" },
    );
  }
  const out = pages.filter((p) => hit(p.label));
  if (!data) return out;

  const { upcoming, final } = splitGames(data.games);
  // With nothing typed: the next few games. Typed: any game, soonest first.
  const games = (q ? [...upcoming, ...final] : upcoming.slice(0, 3))
    .filter((g) => hit(g.opponent, placeLabel(g), formatGameDate(g)))
    .slice(0, PER_GROUP)
    .map((g) => ({
      key: `game-${g.id}`,
      group: "Games",
      label: `vs ${g.opponent}`,
      sub: [formatGameDate(g), placeLabel(g)].filter(Boolean).join(" · "),
      href: `/games/${g.id}`,
      icon: "games" as IconName,
    }));
  out.push(...games);
  if (!q) return out;

  out.push(
    ...data.players
      .filter((p) => p.active !== false && hit(p.name, p.jerseyNumber?.toString()))
      .slice(0, PER_GROUP)
      .map((p) => ({
        key: `player-${p.id}`,
        group: "Players",
        label: p.name,
        sub: p.jerseyNumber !== null && p.jerseyNumber !== undefined ? `#${p.jerseyNumber}` : "",
        href: "/roster",
        icon: "player" as IconName,
      })),
    ...data.practices
      .filter((p) => !p.canceled && hit(p.focus, p.location, p.date))
      .slice(0, PER_GROUP)
      .map((p) => ({
        key: `practice-${p.id}`,
        group: "Practices",
        label: p.focus || "Practice",
        sub: [shortDay(p.date), p.location].filter(Boolean).join(" · "),
        href: `/practices/${p.id}`,
        icon: "practiceDay" as IconName,
      })),
    ...PLAYS.filter((p) => hit(p.name, p.situation))
      .slice(0, PER_GROUP)
      .map((p) => ({
        key: `play-${p.id}`,
        group: "Plays",
        label: p.name,
        sub: p.situation,
        href: `/plays/${p.id}`,
        icon: "plays" as IconName,
      })),
  );
  return out;
}

function shortDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function CommandPalette({ state }: { state: PaletteState }) {
  if (!state.isOpen) return null;
  return <PaletteDialog onClose={state.close} />;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const data = useAppData();
  const { mode } = useStoreState();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const results = useMemo(
    () => searchResults(data, mode === "supabase", query),
    [data, mode, query],
  );
  const at = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const go = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    router.push(r.href);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((at + 1) % Math.max(1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((at - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[at]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] print:hidden">
      <button
        aria-label="Close search"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search RallyCap"
        className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <NavIcon name="search" className="size-5 text-slate-400" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[at] ? `palette-${results[at].key}` : undefined}
            placeholder="Find a game, player, practice, play or page"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 px-1.5 text-xs text-slate-500">Esc</kbd>
        </div>
        <ul ref={list} id="palette-results" role="listbox" className="overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-slate-500">
              Nothing matches “{query.trim()}”.
            </li>
          )}
          {results.map((r, i) => (
            <li key={r.key} role="presentation">
              {(i === 0 || results[i - 1]!.group !== r.group) && (
                <p className="px-3 pt-3 pb-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                  {r.group}
                </p>
              )}
              <button
                id={`palette-${r.key}`}
                data-index={i}
                role="option"
                aria-selected={i === at}
                onMouseMove={() => i !== at && setActive(i)}
                onClick={() => go(r)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                  i === at ? "bg-[var(--team)]/10 text-[var(--team)]" : "text-slate-700"
                }`}
              >
                <NavIcon name={r.icon} className="size-5 opacity-70" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{r.label}</span>
                  {r.sub && <span className="block truncate text-sm text-slate-500">{r.sub}</span>}
                </span>
                {i === at && (
                  <kbd className="text-xs text-slate-400" aria-hidden="true">
                    ↵
                  </kbd>
                )}
              </button>
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <span>
            <Key>↑</Key> <Key>↓</Key> move · <Key>↵</Key> open
          </span>
          <span>
            Shortcuts: <Key>N</Key> new game or player · <Key>A</Key> auto-fill · <Key>U</Key> undo
            · <Key>/</Key> search
          </span>
        </p>
      </div>
    </div>
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-slate-300 bg-white px-1 font-sans text-[11px] text-slate-600">
      {children}
    </kbd>
  );
}
