"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { permissionsFor } from "@/lib/data/permissions";
import { useAppData, useStoreState } from "@/lib/data/store";
import { DataStatus } from "./DataStatus";

type Tab = "games" | "practice" | "plays" | "season" | "roster" | "money";

const TABS: { id: Tab; href: string; label: string }[] = [
  { id: "games", href: "/games", label: "Games" },
  { id: "practice", href: "/practices", label: "Practice" },
  { id: "plays", href: "/plays", label: "Plays" },
  { id: "season", href: "/season", label: "Season" },
  { id: "roster", href: "/roster", label: "Roster" },
  { id: "money", href: "/money", label: "Money" },
];

export function AppShell({
  title,
  subtitle,
  onTitleTap,
  backHref,
  tab,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Makes the title a button (e.g. to switch teams). */
  onTitleTap?: () => void;
  backHref?: string;
  tab: Tab;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:flex print:block print:min-h-0">
      {/* Laptops and desktops: the menu is always open on the side. */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col overflow-y-auto bg-[#0b1f3a] p-3 text-white lg:flex print:hidden"
      >
        <p className="mb-4 px-3 pt-2 text-2xl font-bold tracking-tight">RallyCap</p>
        <MenuLinks tab={tab} />
      </nav>
      <div className="mx-auto flex min-h-dvh w-full max-w-xl min-w-0 flex-col md:max-w-3xl lg:max-w-5xl print:block print:min-h-0 print:max-w-none">
        <header className="sticky top-0 z-20 print:hidden flex min-h-14 items-center gap-1 bg-[#0b1f3a] px-2 text-white shadow">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Back"
              className="flex size-12 shrink-0 items-center justify-center rounded-lg text-2xl font-bold active:bg-white/20"
            >
              ‹
            </Link>
          ) : (
            <span className="w-2" />
          )}
          {onTitleTap ? (
            <button
              onClick={onTitleTap}
              aria-haspopup="dialog"
              className="min-w-0 flex-1 rounded-lg py-1 text-left active:bg-white/15"
            >
              <h1 className="truncate text-lg leading-tight font-bold">
                {title} <span aria-hidden="true">▾</span>
              </h1>
              {subtitle && <p className="truncate text-sm text-white/80">{subtitle}</p>}
            </button>
          ) : (
            <div className="min-w-0 flex-1 py-1">
              <h1 className="truncate text-lg leading-tight font-bold">{title}</h1>
              {subtitle && <p className="truncate text-sm text-white/80">{subtitle}</p>}
            </div>
          )}
          {action}
          {/* Phones and tablets: the menu opens from the top right, within thumb reach. */}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="flex size-12 shrink-0 items-center justify-center rounded-lg active:bg-white/20 lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <main className="flex-1 px-4 pt-4 pb-10 md:px-6 lg:px-8 print:p-0">
          <DataStatus>{children}</DataStatus>
        </main>
      </div>
      <MenuDrawer open={menuOpen} tab={tab} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

/** The menu that slides in from the right on phones and tablets. */
function MenuDrawer({ open, tab, onClose }: { open: boolean; tab: Tab; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden print:hidden">
      <button aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <nav
        ref={panel}
        aria-label="Main"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-[#0b1f3a] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white shadow-2xl outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="px-3 text-2xl font-bold tracking-tight">RallyCap</p>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-12 items-center justify-center rounded-lg text-3xl leading-none active:bg-white/20"
          >
            ×
          </button>
        </div>
        <MenuLinks tab={tab} onPick={onClose} />
      </nav>
    </div>
  );
}

/** Main sections, then team pages the signed-in person can use. */
function MenuLinks({ tab, onPick }: { tab: Tab; onPick?: () => void }) {
  const data = useAppData();
  const { mode } = useStoreState();
  const signedIn = mode === "supabase";
  const perms = data ? permissionsFor(data.me.role, data.team.optionedAt !== null) : null;
  const pathname = usePathname();
  const team: { href: string; label: string; show: boolean }[] = [
    { href: "/members", label: "Coaches & parents", show: signedIn },
    { href: "/season/rules", label: "Fair play rules", show: true },
    { href: "/groupme", label: "GroupMe", show: signedIn && !!perms?.editTeam },
  ];
  const item = (current: boolean) =>
    `flex h-14 items-center rounded-lg px-3 text-lg font-bold lg:h-12 ${
      current ? "bg-white text-[#0b1f3a]" : "text-white/90 hover:bg-white/15 active:bg-white/20"
    }`;
  return (
    <>
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          onClick={onPick}
          aria-current={t.id === tab ? "page" : undefined}
          className={item(t.id === tab && !team.some((x) => x.href === pathname))}
        >
          {t.label}
        </Link>
      ))}
      <p className="mt-5 mb-1 px-3 text-sm font-bold tracking-wide text-white/60 uppercase">Team</p>
      {team
        .filter((x) => x.show)
        .map((x) => (
          <Link
            key={x.href}
            href={x.href}
            onClick={onPick}
            aria-current={pathname === x.href ? "page" : undefined}
            className={item(pathname === x.href)}
          >
            {x.label}
          </Link>
        ))}
    </>
  );
}

export function Loading() {
  return <p className="p-6 text-center text-lg text-slate-600">Loading…</p>;
}
