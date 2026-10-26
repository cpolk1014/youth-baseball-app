"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DataStatus } from "./DataStatus";

type Tab = "games" | "season" | "roster";

const TABS: { id: Tab; href: string; label: string }[] = [
  { id: "games", href: "/games", label: "Games" },
  { id: "season", href: "/season", label: "Season" },
  { id: "roster", href: "/roster", label: "Roster" },
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
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col print:block print:min-h-0 print:max-w-none">
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

      <main className="flex-1 px-4 pt-4 pb-24 print:p-0">
        <DataStatus>{children}</DataStatus>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t-2 print:hidden border-slate-300 bg-white pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-xl">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              aria-current={t.id === tab ? "page" : undefined}
              className={`flex h-16 flex-1 items-center justify-center text-lg font-bold ${
                t.id === tab ? "bg-[#0b1f3a] text-white" : "text-slate-700 active:bg-slate-100"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function Loading() {
  return <p className="p-6 text-center text-lg text-slate-600">Loading…</p>;
}
