"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { themeVars } from "@/lib/branding/theme";
import { myUserId, signOut, syncNow, useAppData, useStoreState } from "@/lib/data/store";
import { initials, useMe, useMyTeamClubs } from "./account/useMe";
import { useMyClubs } from "./club/useMyClubs";
import { DataStatus } from "./DataStatus";
import { OfflineSupport } from "./OfflineSupport";
import { TeamBadge } from "./TeamBadge";
import { CommandPalette, useCommandPalette } from "./shell/CommandPalette";
import { NavIcon, type IconName } from "./shell/NavIcon";
import { ToastHost } from "./shell/Toast";
import {
  GAME_DAY,
  HOME,
  TEAM,
  settingsLinks,
  visibleTabs,
  type MenuTab,
  type Tab,
} from "./shell/nav";

export function AppShell({
  title,
  subtitle,
  onTitleTap,
  backHref,
  tab,
  action,
  bare = false,
  pane,
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
  /** Wide screens: a list beside the page (e.g. every game, next to one game). */
  pane?: ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const data = useAppData();
  const palette = useCommandPalette();
  const rail = useRail();
  return (
    // The team's colors, for everything inside (bars, buttons, badges).
    <div
      className="min-h-dvh lg:flex lg:bg-slate-50 print:block print:min-h-0 print:bg-white"
      style={themeVars(data?.team.colors) as CSSProperties}
    >
      {/* Landscape tablets, laptops and desktops: a light side rail that can fold to icons. */}
      <nav
        aria-label="Main"
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-slate-200 bg-white p-3 text-slate-800 lg:flex print:hidden ${rail.collapsed ? "w-[72px]" : "w-64"}`}
      >
        {/* A plain block, so the header keeps its own height in this column. */}
        <div className="shrink-0">
          <MenuHeader variant="rail" collapsed={rail.collapsed} />
        </div>
        <MenuLinks tab={tab} variant="rail" collapsed={rail.collapsed} />
        <button
          onClick={rail.toggle}
          aria-label={rail.collapsed ? "Show menu labels" : "Fold menu to icons"}
          title={rail.collapsed ? "Show menu labels" : "Fold menu to icons"}
          className="mt-2 flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <NavIcon name={rail.collapsed ? "expand" : "collapse"} />
          {!rail.collapsed && "Fold menu"}
        </button>
      </nav>
      {pane && (
        <aside
          aria-label="List"
          className="sticky top-0 hidden h-dvh w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white xl:block print:hidden"
        >
          {pane}
        </aside>
      )}
      <div className="mx-auto flex min-h-dvh w-full max-w-xl min-w-0 flex-col md:max-w-3xl lg:mx-0 lg:max-w-none lg:flex-1 print:block print:min-h-0 print:max-w-none">
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-1 border-b-4 border-[var(--team-accent)] bg-[var(--team)] px-2 text-white shadow lg:min-h-16 lg:gap-3 lg:border-b lg:border-slate-200 lg:bg-white/95 lg:px-6 lg:text-slate-900 lg:shadow-none lg:backdrop-blur print:hidden">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Back"
              className="flex size-12 shrink-0 items-center justify-center rounded-lg text-2xl font-bold active:bg-white/20 lg:size-10 lg:border lg:border-slate-200 lg:text-xl lg:hover:bg-slate-100 lg:active:bg-slate-200"
            >
              ‹
            </Link>
          ) : (
            <span className="w-2 lg:hidden" />
          )}
          {!backHref && data && (
            <span className="mr-1 lg:hidden">
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
              className="min-w-0 flex-1 rounded-lg py-1 text-left active:bg-white/15 lg:flex-none lg:px-2 lg:hover:bg-slate-100 lg:active:bg-slate-200"
            >
              <h1 className="truncate text-lg leading-tight font-bold lg:text-xl lg:tracking-tight">
                {title} <span aria-hidden="true">▾</span>
              </h1>
              {subtitle && (
                <p className="truncate text-sm text-white/80 lg:text-slate-500">{subtitle}</p>
              )}
            </button>
          ) : (
            <div className="min-w-0 flex-1 py-1 lg:flex-none">
              <h1 className="truncate text-lg leading-tight font-bold lg:text-xl lg:tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="truncate text-sm text-white/80 lg:text-slate-500">{subtitle}</p>
              )}
            </div>
          )}
          <span className="hidden flex-1 lg:block" />
          <button
            onClick={palette.open}
            className="hidden h-10 w-56 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-500 hover:border-slate-300 hover:bg-white lg:flex"
          >
            <NavIcon name="search" className="size-4" />
            <span className="flex-1">Search</span>
            <kbd className="rounded border border-slate-200 bg-white px-1.5 font-sans text-xs text-slate-500">
              {palette.keyHint}
            </kbd>
          </button>
          {/* Header buttons are white on the team color; on the light bar they flip. */}
          {action && (
            <div className="flex shrink-0 items-center gap-2 lg:[&>*]:bg-[var(--team)]! lg:[&>*]:text-white! lg:[&>*]:hover:bg-[var(--team-press)]!">
              {action}
            </div>
          )}
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

        <main className="flex-1 px-4 pt-4 pb-10 md:px-6 lg:px-8 lg:pt-6 print:p-0">
          <div className="lg:mx-auto lg:max-w-6xl print:max-w-none">
            {bare ? children : <DataStatus>{children}</DataStatus>}
          </div>
        </main>
      </div>
      <MenuDrawer open={menuOpen} tab={tab} onClose={() => setMenuOpen(false)} />
      <CommandPalette state={palette} />
      <ToastHost />
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

type Variant = "drawer" | "rail";

const RAIL_KEY = "rallycap:rail";

/** Whether the wide-screen rail is folded to icons (remembered on this device). */
function useRail() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- this device's choice
      setCollapsed(window.localStorage.getItem(RAIL_KEY) === "icons");
    } catch {
      // Private mode: always open.
    }
  }, []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(RAIL_KEY, next ? "icons" : "open");
    } catch {
      // Private mode: just this page.
    }
  };
  return { collapsed, toggle };
}

/** The team's badge and name at the top of the menu; tap to switch teams. */
function MenuHeader({
  onPick,
  variant = "drawer",
  collapsed = false,
}: {
  onPick?: () => void;
  variant?: Variant;
  collapsed?: boolean;
}) {
  const data = useAppData();
  const { mode } = useStoreState();
  const rail = variant === "rail";
  if (!data) {
    // No team yet (club pages, first sign-in): the RallyCap logo.
    const src = collapsed
      ? "/brand/rallycap-icon-color.svg"
      : rail
        ? "/brand/rallycap-horizontal-color.svg"
        : "/brand/rallycap-horizontal-white.svg";
    return (
      <p className={rail ? "mb-3 px-1" : "mb-4 px-1 pt-1"}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
        <img src={src} alt="RallyCap" className={collapsed ? "size-10" : "h-11 w-auto"} />
      </p>
    );
  }
  const inner = (
    <>
      <TeamBadge
        name={data.team.name}
        colors={data.team.colors}
        logoPath={data.team.logoPath}
        size={rail ? 40 : 44}
      />
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate leading-tight font-bold ${rail ? "text-base text-slate-900" : "text-lg"}`}
          >
            {data.team.name}
          </span>
          <span
            className={`block text-xs font-semibold tracking-wide uppercase ${rail ? "text-slate-400" : "text-white/60"}`}
          >
            {mode === "supabase" ? "Switch team ▾" : "RallyCap"}
          </span>
        </span>
      )}
    </>
  );
  const box = rail
    ? `mb-3 flex min-w-0 items-center gap-3 rounded-xl p-1.5 ${collapsed ? "justify-center" : ""}`
    : "mb-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1";
  return mode === "supabase" ? (
    <Link
      href="/my-teams"
      onClick={onPick}
      title={collapsed ? `${data.team.name}: switch team` : undefined}
      className={`${box} ${rail ? "hover:bg-slate-100" : "hover:bg-white/15 active:bg-white/20"}`}
    >
      {inner}
    </Link>
  ) : (
    <div className={`${box} ${rail ? "" : "pt-2"}`}>{inner}</div>
  );
}

/** Link styles for the phone/tablet drawer (white on the team color) and the light rail. */
function itemClass(variant: Variant, current: boolean, collapsed = false) {
  if (variant === "rail") {
    return `flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-[15px] font-semibold ${
      collapsed ? "justify-center px-0" : ""
    } ${
      current
        ? "bg-[var(--team)]/10 text-[var(--team)]"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;
  }
  return `flex h-14 items-center rounded-lg px-3 text-lg font-bold ${
    current ? "bg-white text-[var(--team)]" : "text-white/90 hover:bg-white/15 active:bg-white/20"
  }`;
}

/** Game day, team and team settings sections, then the signed-in person's account. */
function MenuLinks({
  tab,
  onPick,
  variant = "drawer",
  collapsed = false,
}: {
  tab: Tab;
  onPick?: () => void;
  variant?: Variant;
  collapsed?: boolean;
}) {
  const data = useAppData();
  const { mode } = useStoreState();
  const signedIn = mode === "supabase";
  const pathname = usePathname();
  const rail = variant === "rail";
  const settings = settingsLinks(data, signedIn);
  const isOn = (x: { href: string; also: string[] }) =>
    pathname === x.href || x.also.includes(pathname);
  const onSetting = settings.some(isOn);
  const groupTitle = rail
    ? "mt-5 mb-1 px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase"
    : "mt-4 mb-1 px-3 text-sm font-bold tracking-wide text-white/60 uppercase";
  const heading = (title: string) =>
    rail && collapsed ? (
      <hr className="mx-2 my-3 border-slate-200" />
    ) : (
      <p className={groupTitle}>{title}</p>
    );
  const link = (x: { href: string; label: string; icon: IconName }, current: boolean) => (
    <Link
      key={x.href}
      href={x.href}
      onClick={onPick}
      title={collapsed ? x.label : undefined}
      aria-current={current ? "page" : undefined}
      className={itemClass(variant, current, collapsed)}
    >
      {rail && <NavIcon name={x.icon} />}
      {rail && collapsed ? <span className="sr-only">{x.label}</span> : x.label}
    </Link>
  );
  // Parents have no Team settings: Coaches & parents sits under Roster instead.
  const parent = data?.me.role === "parent";
  const section = (title: string, tabs: MenuTab[]) => (
    <>
      {heading(title)}
      {visibleTabs(tabs, data).map((t) => (
        <Fragment key={t.href}>
          {link(t, t.id === tab && !onSetting)}
          {parent && t.id === "roster" && settings.map((x) => link(x, isOn(x)))}
        </Fragment>
      ))}
    </>
  );
  return (
    <>
      {/* Home: tablets and up (phones open on Games). */}
      {data && (
        <div className={rail ? "flex flex-col" : "hidden flex-col md:flex"}>
          {link(HOME, tab === "home")}
        </div>
      )}
      {section("Game day", GAME_DAY)}
      {section("Team", TEAM)}
      {settings.length > 0 && !parent && (
        <>
          {heading("Team settings")}
          {settings.map((x) => link(x, isOn(x)))}
        </>
      )}
      {signedIn && (
        <AccountMenu tab={tab} onPick={onPick} variant={variant} collapsed={collapsed} />
      )}
    </>
  );
}

/** My RallyCap: the person's initials in a circle; opens their profile, teams and clubs. */
function AccountMenu({
  tab,
  onPick,
  variant,
  collapsed,
}: {
  tab: Tab;
  onPick?: () => void;
  variant: Variant;
  collapsed: boolean;
}) {
  const me = useMe();
  const data = useAppData();
  const clubs = useMyClubs();
  const teamClubs = useMyTeamClubs();
  const pathname = usePathname();
  const [open, setOpen] = useState(tab === "account" || tab === "club");
  const router = useRouter();
  const rail = variant === "rail";
  // Families linked to a player import that player's box scores.
  const hasKids = !!data && data.guardians.some((g) => g.userId === myUserId(data));
  const inAClub = (clubs?.length ?? 0) > 0 || (teamClubs?.length ?? 0) > 0;
  const links = [
    { href: "/profile", label: "My profile", show: true },
    { href: "/my-teams", label: "My teams", show: true },
    {
      href: "/my-clubs",
      label: "My clubs",
      show: inAClub,
    },
    // Anyone can start a club on their own (it opens the club page's Start a club).
    { href: "/club", label: "Start a club", show: clubs !== null && !inAClub },
    { href: "/my-player", label: myPlayerLabel(data), show: hasKids },
  ].filter((x) => x.show);
  const current = (href: string) =>
    pathname === href || (href === "/my-clubs" && pathname.startsWith("/club"));
  const plain = rail
    ? "flex min-h-10 items-center rounded-lg px-3 text-left text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
    : "flex min-h-12 items-center rounded-lg px-3 text-left text-base font-semibold text-white/80 hover:bg-white/15 active:bg-white/20";

  return (
    <div
      className={`mt-auto pt-3 ${rail ? "border-t border-slate-200" : "border-t-2 border-white/15"}`}
    >
      <button
        // Folded rail: no room for the list, so go straight to the profile.
        onClick={() => (collapsed ? router.push("/profile") : setOpen(!open))}
        aria-expanded={collapsed ? undefined : open}
        aria-label={collapsed ? "My RallyCap" : undefined}
        title={collapsed ? (me?.name ?? "My RallyCap") : undefined}
        className={`flex w-full items-center gap-3 rounded-lg text-left ${
          rail
            ? `min-h-12 px-1.5 hover:bg-slate-100 ${collapsed ? "justify-center" : ""}`
            : "min-h-14 px-2 hover:bg-white/15 active:bg-white/20"
        }`}
      >
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center rounded-full font-black ${
            rail
              ? "size-9 bg-[var(--team)] text-sm text-white"
              : "size-11 bg-white text-lg text-[var(--team)]"
          }`}
        >
          {initials(me)}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate leading-tight font-bold ${rail ? "text-sm text-slate-900" : "text-base"}`}
              >
                {me?.name ?? me?.email ?? "My RallyCap"}
              </span>
              <span
                className={`block text-xs font-semibold tracking-wide uppercase ${rail ? "text-slate-400" : "text-white/60"}`}
              >
                My RallyCap
              </span>
            </span>
            <span aria-hidden="true" className={rail ? "text-slate-400" : "text-white/70"}>
              {open ? "▾" : "▴"}
            </span>
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="mt-1 flex flex-col">
          {links.map((x) => (
            <Link
              key={x.href}
              href={x.href}
              onClick={onPick}
              aria-current={current(x.href) ? "page" : undefined}
              className={
                rail
                  ? itemClass("rail", current(x.href))
                  : `flex h-12 items-center rounded-lg px-3 text-base font-bold ${
                      current(x.href)
                        ? "bg-white text-[var(--team)]"
                        : "text-white/90 hover:bg-white/15 active:bg-white/20"
                    }`
              }
            >
              {x.label}
            </Link>
          ))}
          <SyncButton className={plain} />
          <button onClick={() => void signOut()} className={plain}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** "My player: Leo T." (or "My players: Leo, Mia" for families with more than one). */
function myPlayerLabel(data: ReturnType<typeof useAppData>): string {
  if (!data) return "My player";
  const me = myUserId(data);
  const ids = new Set(data.guardians.filter((g) => g.userId === me).map((g) => g.playerId));
  const kids = data.players.filter((p) => ids.has(p.id));
  if (kids.length === 0) return "My player";
  if (kids.length === 1) return `My player: ${kids[0]!.name}`;
  return `My players: ${kids.map((k) => k.name.split(" ")[0]).join(", ")}`;
}

/** Pull what changed on other phones and computers, in case this one is behind. */
function SyncButton({ className }: { className: string }) {
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
      className={className}
    >
      {label}
    </button>
  );
}

/** Gray shapes where the page will be, while it loads. */
export function Loading() {
  const bar = "rounded-xl bg-slate-200/80";
  return (
    <div role="status" aria-label="Loading" className="animate-pulse motion-reduce:animate-none">
      <div className={`mb-4 h-24 ${bar} lg:h-32`} />
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border-2 border-slate-100 bg-white p-4 lg:border">
            <div className={`mb-2 h-3 w-1/3 ${bar}`} />
            <div className={`mb-2 h-5 w-2/3 ${bar}`} />
            <div className={`h-3 w-1/2 ${bar}`} />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
