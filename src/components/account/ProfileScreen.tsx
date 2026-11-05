"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MyPlayer } from "@/lib/data/account-backend";
import { ROLE_LABEL } from "@/lib/data/permissions";
import { cleanPhone, formatPhone } from "@/lib/phone/phone";
import { cleanVenmo } from "@/lib/venmo/handle";
import { signOut, switchTeam, useAppData, useStoreState } from "@/lib/data/store";
import { AppShell } from "../AppShell";
import { useMyClubs } from "../club/useMyClubs";
import {
  BuyPlayerStats,
  PurchasesTable,
  useMyKids,
  usePurchases,
  useStatsPasses,
} from "../kidstats/familyPass";
import { initials, refreshMe, useMe, useMyTeamClubs } from "./useMe";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const card = "rounded-xl border-2 border-slate-200 bg-white p-4";

/** My Profile: my name and email, my players, my teams and my clubs. */
export function ProfileScreen() {
  const { mode } = useStoreState();
  const me = useMe();
  const data = useAppData();
  const clubs = useMyClubs();
  const teamClubs = useMyTeamClubs();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<MyPlayer[] | null>(null);
  const [venmo, setVenmo] = useState<string | null>(null);
  const [venmoSaved, setVenmoSaved] = useState<string | null | undefined>(undefined);
  const [venmoMsg, setVenmoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneSaved, setPhoneSaved] = useState<string | null | undefined>(undefined);
  const [phoneMsg, setPhoneMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const myKids = useMyKids();
  const stats = useStatsPasses();
  const [paidAt, setPaidAt] = useState(0);
  const purchases = usePurchases(paidAt);
  // Back from Stripe: the payment lands a moment later, so check again for a few seconds.
  const [justPaid] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("paid"),
  );
  const { reload: reloadStats } = stats;
  // From "Unlock" on a player's page: bring Player stats into view once it's there.
  const kidsLoaded = myKids !== null;
  useEffect(() => {
    if (kidsLoaded && window.location.hash === "#player-stats") {
      document.getElementById("player-stats")?.scrollIntoView({ block: "start" });
    }
  }, [kidsLoaded]);
  useEffect(() => {
    if (!justPaid) return;
    const timers = [2000, 5000, 10000].map((ms) =>
      setTimeout(() => {
        reloadStats();
        setPaidAt(ms);
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [justPaid, reloadStats]);

  useEffect(() => {
    if (!me?.id) return;
    let current = true;
    import("@/lib/data/account-backend")
      .then((m) =>
        Promise.all([
          m.myPlayers(me.id),
          m.myVenmo(me.id).catch(() => null),
          m.myPhone(me.id).catch(() => null),
        ]),
      )
      .then(
        ([p, v, ph]) => {
          if (!current) return;
          setPlayers(p);
          setVenmoSaved(v);
          setPhoneSaved(ph);
        },
        () => current && setPlayers([]),
      );
    return () => {
      current = false;
    };
  }, [me?.id]);

  const shell = (children: React.ReactNode) => (
    <AppShell brand title="My profile" tab="account" bare>
      {children}
    </AppShell>
  );
  if (mode !== "supabase") return shell(<p className="text-lg">Profiles need sign-in.</p>);

  const shownName = name ?? me?.name ?? "";
  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await (await import("@/lib/data/account-backend")).saveMyName(shownName);
      refreshMe();
      setName(null);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const teams = data?.myTeams ?? [];
  const phoneShown = phone ?? (phoneSaved ? formatPhone(phoneSaved) : "");
  const savePhone = async (clear = false) => {
    setPhoneMsg(null);
    const cleaned = clear ? null : cleanPhone(phoneShown);
    if (!clear && !cleaned) {
      setPhoneMsg({
        ok: false,
        text: "That doesn't look like a phone number. Include the area code.",
      });
      return;
    }
    try {
      await (await import("@/lib/data/account-backend")).saveMyPhone(me!.id, cleaned);
      setPhoneSaved(cleaned);
      setPhone(null);
      setPhoneMsg({ ok: true, text: clear ? "Removed." : "Saved." });
    } catch (e) {
      setPhoneMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };
  const venmoShown = venmo ?? venmoSaved ?? "";
  const saveVenmo = async (clear = false) => {
    setVenmoMsg(null);
    const handle = clear ? null : cleanVenmo(venmoShown);
    if (!clear && !handle) {
      setVenmoMsg({
        ok: false,
        text: "That isn't a Venmo username (5 to 30 letters, numbers, - or _).",
      });
      return;
    }
    try {
      await (await import("@/lib/data/account-backend")).saveMyVenmo(me!.id, handle);
      setVenmoSaved(handle);
      setVenmo(null);
      setVenmoMsg({ ok: true, text: clear ? "Removed." : "Saved." });
    } catch (e) {
      setVenmoMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  return shell(
    <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
      <section className={`${card} flex flex-col gap-3`}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[var(--team)] text-2xl font-black text-white"
          >
            {initials(me)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xl font-bold">{me?.name ?? "Add your name"}</p>
            <p className="truncate text-base text-slate-600">{me?.email}</p>
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold">Name</span>
          <input
            value={shownName}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            maxLength={60}
            autoComplete="name"
            placeholder="First and last name"
            className="h-12 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none"
          />
          <span className="text-sm text-slate-600">
            Shown to your teams and clubs (for example, as head coach).
          </span>
        </label>
        {name !== null && name.trim() !== (me?.name ?? "") && (
          <button
            onClick={() => void save()}
            disabled={busy || !shownName.trim()}
            className="h-12 rounded-xl bg-[var(--team)] text-base font-bold text-white disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save name"}
          </button>
        )}
        {saved && (
          <p role="status" className="text-base font-semibold text-green-800">
            Saved.
          </p>
        )}
        {error && (
          <p role="alert" className="text-base font-semibold text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="phone" className="text-base font-semibold">
            Cell phone <span className="font-normal text-slate-600">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phoneShown}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneMsg(null);
            }}
            placeholder="(337) 555-0123"
            maxLength={25}
            className="h-12 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none"
          />
          <span className="text-sm text-slate-600">
            Your teams see it on Coaches &amp; parents and on the roster by your player&apos;s name,
            so families and coaches can call or text you.
          </span>
          <div className="flex gap-2">
            {phone !== null && phone.trim() !== "" && cleanPhone(phone) !== phoneSaved && (
              <button
                onClick={() => void savePhone()}
                className="h-11 flex-1 rounded-xl bg-[var(--team)] text-base font-bold text-white"
              >
                Save phone
              </button>
            )}
            {phoneSaved && (
              <button
                onClick={() => void savePhone(true)}
                className="h-11 rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-semibold"
              >
                Remove
              </button>
            )}
          </div>
          {phoneMsg && (
            <p
              role={phoneMsg.ok ? "status" : "alert"}
              className={`text-base font-semibold ${phoneMsg.ok ? "text-green-800" : "text-red-700"}`}
            >
              {phoneMsg.text}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="venmo" className="text-base font-semibold">
            Venmo handle <span className="font-normal text-slate-600">(optional)</span>
          </label>
          <div className="flex gap-2">
            <span className="flex h-12 items-center text-lg font-bold text-slate-500">@</span>
            <input
              id="venmo"
              value={venmoShown}
              onChange={(e) => {
                setVenmo(e.target.value);
                setVenmoMsg(null);
              }}
              placeholder="Your-Venmo-Name"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={60}
              className="h-12 min-w-0 flex-1 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none"
            />
          </div>
          <span className="text-sm text-slate-600">
            Only you see this. Teammates&apos; families get a blue Venmo <b>V</b> button by your
            name on Coaches &amp; parents.
          </span>
          <div className="flex gap-2">
            {venmo !== null && venmo.trim() !== (venmoSaved ?? "") && venmo.trim() !== "" && (
              <button
                onClick={() => void saveVenmo()}
                className="h-11 flex-1 rounded-xl bg-[var(--team)] text-base font-bold text-white"
              >
                Save Venmo
              </button>
            )}
            {venmoSaved && (
              <button
                onClick={() => void saveVenmo(true)}
                className="h-11 rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-semibold"
              >
                Remove
              </button>
            )}
          </div>
          {venmoMsg && (
            <p
              role={venmoMsg.ok ? "status" : "alert"}
              className={`text-base font-semibold ${venmoMsg.ok ? "text-green-800" : "text-red-700"}`}
            >
              {venmoMsg.text}
            </p>
          )}
        </div>
        <div>
          <p className="text-base font-semibold">Email</p>
          <p className="text-base text-slate-700">{me?.email ?? "…"}</p>
          <p className="text-sm text-slate-600">You sign in with this email.</p>
        </div>
      </section>

      {players && players.length > 0 && (
        <section className={card}>
          <h2 className={heading}>My players</h2>
          <ul className="flex flex-col gap-2">
            {players.map((p) => (
              <li key={p.playerId}>
                <button
                  onClick={() => {
                    switchTeam(p.teamId);
                    router.push(`/my-player?player=${p.playerId}`);
                  }}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 text-left active:bg-slate-100"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold">
                      {p.name}
                      {p.jerseyNumber !== null ? ` #${p.jerseyNumber}` : ""}
                    </span>
                    <span className="block truncate text-sm text-slate-600">{p.teamName}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-[var(--team)]">Stats ›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {myKids && myKids.length > 0 && (
        <section id="player-stats" className={`${card} scroll-mt-20`}>
          <h2 className={heading}>Player stats</h2>
          {justPaid && (
            <p
              role="status"
              className="mb-3 rounded-xl bg-green-50 p-3 text-base font-semibold text-green-900"
            >
              Thanks! Your player stats are unlocking; it can take a few seconds.
            </p>
          )}
          {stats.loading ? (
            <p className="text-base text-slate-600">Loading…</p>
          ) : (
            <BuyPlayerStats key={stats.passes?.length ?? 0} kids={myKids} stats={stats} />
          )}
        </section>
      )}

      <section className={`${card} md:col-span-2`}>
        <h2 className={heading}>My purchases</h2>
        {purchases === null ? (
          <p className="text-base text-slate-600">Loading…</p>
        ) : (
          <PurchasesTable rows={purchases} />
        )}
      </section>

      <section className={card}>
        <h2 className={heading}>My teams</h2>
        <ul className="mb-3 flex flex-col gap-1 text-base">
          {teams.map((t) => (
            <li key={t.id} className="flex justify-between gap-2">
              <span className="truncate font-semibold">{t.name}</span>
              <span className="shrink-0 text-slate-600">{ROLE_LABEL[t.role]}</span>
            </li>
          ))}
          {teams.length === 0 && <li className="text-slate-700">No teams yet.</li>}
        </ul>
        <Link href="/my-teams" className="font-semibold text-[var(--team)] underline">
          Switch or start a team
        </Link>
      </section>

      {((clubs?.length ?? 0) > 0 || (teamClubs?.length ?? 0) > 0) && (
        <section className={card}>
          <h2 className={heading}>My clubs</h2>
          <ul className="mb-3 flex flex-col gap-1 text-base">
            {clubs?.map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="truncate font-semibold">{c.name}</span>
                <span className="shrink-0 text-slate-600">
                  {c.role === "director" ? "Director" : "Assistant director"}
                </span>
              </li>
            ))}
            {teamClubs
              ?.filter((t) => !clubs?.some((c) => c.name === t.club))
              .map((t) => (
                <li key={t.teamId} className="flex justify-between gap-2">
                  <span className="truncate font-semibold">{t.club}</span>
                  <span className="shrink-0 text-slate-600">{t.teamName}</span>
                </li>
              ))}
          </ul>
          <Link href="/my-clubs" className="font-semibold text-[var(--team)] underline">
            Open my clubs
          </Link>
        </section>
      )}

      <button
        onClick={() => void signOut()}
        className="h-12 rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100 md:col-span-2"
      >
        Sign out
      </button>
    </div>,
  );
}
