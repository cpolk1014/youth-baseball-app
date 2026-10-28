"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DataStatus } from "./DataStatus";

type Tab = "games" | "practice" | "plays" | "season" | "roster" | "money";

// Money lives in the desktop side menu; phones reach it from the Roster tab, since six
// bottom tabs don't fit at 375px.
const TABS: { id: Tab; href: string; label: string; phone?: false }[] = [
  { id: "games", href: "/games", label: "Games" },
  { id: "practice", href: "/practices", label: "Practice" },
  { id: "plays", href: "/plays", label: "Plays" },
  { id: "season", href: "/season", label: "Season" },
  { id: "roster", href: "/roster", label: "Roster" },
  { id: "money", href: "/money", label: "Money", phone: false },
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
  return (
    <div className="min-h-dvh lg:flex print:block print:min-h-0">
      {/* Laptops and desktops: a side menu instead of the bottom tab bar. */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 bg-[#0b1f3a] p-3 text-white lg:flex print:hidden"
      >
        <p className="mb-4 px-3 pt-2 text-2xl font-bold tracking-tight">RallyCap</p>
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            aria-current={t.id === tab ? "page" : undefined}
            className={`flex h-12 items-center rounded-lg px-3 text-lg font-bold ${
              t.id === tab ? "bg-white text-[#0b1f3a]" : "text-white/90 hover:bg-white/15"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mx-auto flex min-h-dvh w-full max-w-xl min-w-0 flex-col md:max-w-3xl lg:max-w-5xl print:block print:min-h-0 print:max-w-none">
        <header className="sticky top-0 z-20 print:hidden flex min-h-14 items-center gap-2 bg-[#0b1f3a] px-2 text-white shadow">
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
        </header>

        <main className="flex-1 px-4 pt-4 pb-24 md:px-6 lg:px-8 lg:pb-10 print:p-0">
          <DataStatus>{children}</DataStatus>
        </main>

        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-slate-300 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
        >
          <div className="mx-auto flex max-w-xl md:max-w-3xl">
            {TABS.filter((t) => t.phone !== false).map((t) => (
              <Link
                key={t.id}
                href={t.href}
                aria-current={t.id === tab ? "page" : undefined}
                className={`flex h-16 min-w-0 flex-1 items-center justify-center text-base font-bold ${
                  t.id === tab ? "bg-[#0b1f3a] text-white" : "text-slate-700 active:bg-slate-100"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

export function Loading() {
  return <p className="p-6 text-center text-lg text-slate-600">Loading…</p>;
}
