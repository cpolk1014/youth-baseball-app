"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { themeVars } from "@/lib/branding/theme";
import { isCoach, permissionsFor } from "@/lib/data/permissions";
import { myUserId, signOut, syncNow, useAppData, useStoreState } from "@/lib/data/store";
import { initials, useMe, useMyTeamClubs } from "./account/useMe";
import { useMyClubs } from "./club/useMyClubs";
import { DataStatus } from "./DataStatus";
import { OfflineSupport } from "./OfflineSupport";
import { TeamBadge } from "./TeamBadge";

type Tab =
  | "games"
  | "pa"
  | "practice"
  | "plays"
  | "season"
  | "stats"
  | "roster"
  | "money"
  | "club"
  | "account";

type MenuTab = { id: Tab; href: string; label: string; staffOnly?: boolean };

/** The menu's sections, grouped by what people are doing. */
const GAME_DAY: MenuTab[] = [
  { id: "games", href: "/games", label: "Games" },
  { id: "pa", href: "/pa", label: "Gameday PA" },
];
const TEAM: MenuTab[] = [
  { id: "roster", href: "/roster", label: "Roster" },
  { id: "practice", href: "/practices", label: "Practice" },
  { id: "plays", href: "/plays", label: "Plays" },
  { id: "season", href: "/season", label: "Playing time" },
  { id: "stats", href: "/stats", label: "Stats", staffOnly: true },
  { id: "money", href: "/money", label: "Money" },
];

export function AppShell({
  title,
  subtitle,
  onTitleTap,
  backHref,
  tab,
  action,
  bare = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Makes the title a button (e.g. to switch teams). */
  onTitleTap?: () => void;
  backHref?: string;
  tab: Tab;
  action?: ReactNode;
  /** Club pages: shown even with no team of your own (no team setup or team notices). */
  bare?: boolean;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const data = useAppData();
  return (
    // The team's colors, for everything inside (bars, buttons, badges).
    <div
      className="min-h-dvh lg:flex print:block print:min-h-0"
      style={themeVars(data?.team.colors) as CSSProperties}
    >
      {/* Laptops and desktops: the menu is always open on the side. */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col overflow-y-auto bg-[var(--team)] p-3 text-white lg:flex print:hidden"
      >
        {/* A plain block, so the header keeps its own height in this column. */}
        <div className="shrink-0">
          <MenuHeader />
        </div>
        <MenuLinks tab={tab} />
      </nav>
      <div className="mx-auto flex min-h-dvh w-full max-w-xl min-w-0 flex-col md:max-w-3xl lg:max-w-5xl print:block print:min-h-0 print:max-w-none">
        <header className="sticky top-0 z-20 print:hidden flex min-h-14 items-center gap-1 border-b-4 border-[var(--team-accent)] bg-[var(--team)] px-2 text-white shadow">
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
          {!backHref && data && (
            <span className="mr-1">
              <TeamBadge
                name={data.team.name}
                colors={data.team.colors}
                logoPath={data.team.logoPath}
                size={38}
              />
            </span>
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
          {bare ? children : <DataStatus>{children}</DataStatus>}
        </main>
      </div>
      <MenuDrawer open={menuOpen} tab={tab} onClose={() => setMenuOpen(false)} />
      <OfflineSupport />
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
        className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-[var(--team)] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white shadow-2xl outline-none"
      >
        <div className="mb-2 flex items-center justify-between gap-1">
          <MenuHeader onPick={onClose} />
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

/** The team's badge and name at the top of the menu; tap to switch teams. */
function MenuHeader({ onPick }: { onPick?: () => void }) {
  const data = useAppData();
  const { mode } = useStoreState();
  if (!data) return <p className="mb-4 px-3 pt-2 text-2xl font-bold tracking-tight">RallyCap</p>;
  const inner = (
    <>
      <TeamBadge
        name={data.team.name}
        colors={data.team.colors}
        logoPath={data.team.logoPath}
        size={44}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg leading-tight font-bold">{data.team.name}</span>
        <span className="block text-xs font-semibold tracking-wide text-white/60 uppercase">
          {mode === "supabase" ? "Switch team ▾" : "RallyCap"}
        </span>
      </span>
    </>
  );
  return mode === "supabase" ? (
    <Link
      href="/my-teams"
      onClick={onPick}
      className="mb-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1 hover:bg-white/15 active:bg-white/20"
    >
      {inner}
    </Link>
  ) : (
    <div className="mb-2 flex min-w-0 items-center gap-3 px-2 pt-2">{inner}</div>
  );
}

/** Game day, team and team settings sections, then the signed-in person's account. */
function MenuLinks({ tab, onPick }: { tab: Tab; onPick?: () => void }) {
  const data = useAppData();
  const { mode } = useStoreState();
  const signedIn = mode === "supabase";
  const perms = data ? permissionsFor(data.me.role, data.team.optionedAt !== null) : null;
  // Coaches (and owners) and managers; stays true on an optioned team, unlike editTeam.
  const staff = !!data && (isCoach(data.me.role) || data.me.role === "manager");
  const pathname = usePathname();
  const settings = [
    { href: "/members", label: "Coaches & parents", show: signedIn, also: [] as string[] },
    { href: "/season/rules", label: "Fair play rules", show: true, also: [] },
    {
      href: "/team-look",
      label: "Colors, logo & uniforms",
      show: !!perms?.editTeam,
      also: ["/uniforms"],
    },
    {
      href: "/groupme",
      label: "GroupMe",
      show: signedIn && !!perms?.editTeam,
      also: [],
    },
  ].filter((x) => x.show);
  const isOn = (x: { href: string; also: string[] }) =>
    pathname === x.href || x.also.includes(pathname);
  const onSetting = settings.some(isOn);
  const item = (current: boolean) =>
    `flex h-14 items-center rounded-lg px-3 text-lg font-bold lg:h-12 ${
      current ? "bg-white text-[var(--team)]" : "text-white/90 hover:bg-white/15 active:bg-white/20"
    }`;
  const groupTitle = "mt-4 mb-1 px-3 text-sm font-bold tracking-wide text-white/60 uppercase";
  const section = (title: string, tabs: MenuTab[]) => (
    <>
      <p className={groupTitle}>{title}</p>
      {tabs
        .filter((t) => !t.staffOnly || staff)
        .map((t) => (
          <Link
            key={t.id}
            href={t.href}
            onClick={onPick}
            aria-current={t.id === tab && !onSetting ? "page" : undefined}
            className={item(t.id === tab && !onSetting)}
          >
            {t.label}
          </Link>
        ))}
    </>
  );
  return (
    <>
      {section("Game day", GAME_DAY)}
      {section("Team", TEAM)}
      {settings.length > 0 && (
        <>
          <p className={groupTitle}>Team settings</p>
          {settings.map((x) => (
            <Link
              key={x.href}
              href={x.href}
              onClick={onPick}
              aria-current={isOn(x) ? "page" : undefined}
              className={item(isOn(x))}
            >
              {x.label}
            </Link>
          ))}
        </>
      )}
      {signedIn && <AccountMenu tab={tab} onPick={onPick} />}
    </>
  );
}

/** My RallyCap: the person's initials in a circle; opens their profile, teams and clubs. */
function AccountMenu({ tab, onPick }: { tab: Tab; onPick?: () => void }) {
  const me = useMe();
  const data = useAppData();
  const clubs = useMyClubs();
  const teamClubs = useMyTeamClubs();
  const pathname = usePathname();
  const [open, setOpen] = useState(tab === "account" || tab === "club");
  // Families linked to a player import that player's box scores.
  const hasKids = !!data && data.guardians.some((g) => g.userId === myUserId(data));
  const links = [
    { href: "/profile", label: "My profile", show: true },
    { href: "/my-teams", label: "My teams", show: true },
    {
      href: "/my-clubs",
      label: "My clubs",
      show: (clubs?.length ?? 0) > 0 || (teamClubs?.length ?? 0) > 0,
    },
    { href: "/my-stats", label: "My player's stats", show: hasKids },
  ].filter((x) => x.show);
  const current = (href: string) =>
    pathname === href || (href === "/my-clubs" && pathname.startsWith("/club"));

  return (
    <div className="mt-auto border-t-2 border-white/15 pt-3">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-white/15 active:bg-white/20"
      >
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-lg font-black text-[var(--team)]"
        >
          {initials(me)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base leading-tight font-bold">
            {me?.name ?? me?.email ?? "My RallyCap"}
          </span>
          <span className="block text-xs font-semibold tracking-wide text-white/60 uppercase">
            My RallyCap
          </span>
        </span>
        <span aria-hidden="true" className="text-white/70">
          {open ? "▾" : "▴"}
        </span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col">
          {links.map((x) => (
            <Link
              key={x.href}
              href={x.href}
              onClick={onPick}
              aria-current={current(x.href) ? "page" : undefined}
              className={`flex h-12 items-center rounded-lg px-3 text-base font-bold ${
                current(x.href)
                  ? "bg-white text-[var(--team)]"
                  : "text-white/90 hover:bg-white/15 active:bg-white/20"
              }`}
            >
              {x.label}
            </Link>
          ))}
          <SyncButton />
          <button
            onClick={() => void signOut()}
            className="flex min-h-12 items-center rounded-lg px-3 text-left text-base font-semibold text-white/80 hover:bg-white/15 active:bg-white/20"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Pull what changed on other phones and computers, in case this one is behind. */
function SyncButton() {
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "failed">("idle");
  const sync = async () => {
    setStatus("syncing");
    setStatus((await syncNow()) ? "done" : "failed");
    setTimeout(() => setStatus("idle"), 4000);
  };
  const label = {
    idle: "↻ Sync now",
    syncing: "Syncing…",
    done: "✓ Up to date",
    failed: "Couldn't sync. Check your signal.",
  }[status];
  return (
    <button
      onClick={() => void sync()}
      disabled={status === "syncing"}
      aria-live="polite"
      className="flex min-h-12 items-center rounded-lg px-3 text-left text-base font-semibold text-white/80 hover:bg-white/15 active:bg-white/20"
    >
      {label}
    </button>
  );
}

export function Loading() {
  return <p className="p-6 text-center text-lg text-slate-600">Loading…</p>;
}
