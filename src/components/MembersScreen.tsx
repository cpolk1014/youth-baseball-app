"use client";

import { useState } from "react";
import { ROLE_LABEL, canCallUp, permissionsFor, type MemberRole } from "@/lib/data/permissions";
import {
  createInvite,
  deleteTeam,
  inviteUrl,
  removeMember,
  revokeInvite,
  setMemberRole,
  setOptioned,
  signOut,
  useAppData,
  useStoreState,
} from "@/lib/data/store";
import type { Invite, Member } from "@/lib/data/types";
import { AppShell, Loading } from "./AppShell";
import { KidsForm, kidsOf } from "./KidPicker";
import { Sheet } from "./Sheet";

const INVITE_ROLES: { role: MemberRole; label: string; hint: string }[] = [
  {
    role: "parent",
    label: "Invite parents",
    hint: "One link for all families · 14 days · view only",
  },
  { role: "coach", label: "Invite a coach", hint: "One person · 7 days · can edit everything" },
  { role: "manager", label: "Invite a manager", hint: "One person · 7 days · roster and games" },
];

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("at least one coach")
    ? "A team needs at least one coach. Make someone else a coach first."
    : msg;
}

export function MembersScreen() {
  const data = useAppData();
  const { mode } = useStoreState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ role: MemberRole; url: string } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [optioning, setOptioning] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [kidsFor, setKidsForMember] = useState<Member | null>(null);

  if (!data) {
    return (
      <AppShell title="Team members" backHref="/roster" tab="roster">
        <Loading />
      </AppShell>
    );
  }
  if (mode === "local") {
    return (
      <AppShell title="Team members" backHref="/roster" tab="roster">
        <p className="rounded-xl border-2 border-slate-300 bg-white p-4 text-base">
          Inviting coaches and parents needs sign-in, which isn&apos;t set up in this copy of the
          app.
        </p>
      </AppShell>
    );
  }

  const perms = permissionsFor(data.me.role, data.team.optionedAt !== null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const order: MemberRole[] = ["coach", "manager", "treasurer", "parent"];
  const members = [...data.members].sort(
    (a, b) =>
      order.indexOf(a.role) - order.indexOf(b.role) ||
      (a.displayName ?? "").localeCompare(b.displayName ?? ""),
  );
  const nameOf = (m: Member) =>
    m.displayName ?? (m.userId === data.me.userId ? "You" : ROLE_LABEL[m.role]);

  return (
    <AppShell title="Team members" subtitle={data.team.name} backHref="/roster" tab="roster">
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl border-2 border-red-700 bg-red-50 p-3 text-base font-semibold text-red-950"
        >
          {error}
        </p>
      )}

      {perms.manageMembers && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            Invite people
          </h2>
          <div className="flex flex-col gap-2">
            {INVITE_ROLES.map((r) => (
              <button
                key={r.role}
                disabled={busy}
                onClick={() =>
                  run(async () => setCreated({ role: r.role, url: await createInvite(r.role) }))
                }
                className="flex min-h-14 flex-col items-start justify-center rounded-xl border-2 border-slate-300 bg-white px-4 py-2 text-left active:bg-slate-50 disabled:opacity-50"
              >
                <span className="text-lg font-bold text-[#0b1f3a]">{r.label}</span>
                <span className="text-sm text-slate-600">{r.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            You get a link to share in GroupMe, a text or an email. People open it, sign in with
            their email, type their name and pick their player.
          </p>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
          On the team ({members.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const isMe = m.userId === data.me.userId;
            const kids = kidsOf(data, m.userId);
            // Coaches and managers link anyone; everyone can set their own.
            const canLink = !data.team.optionedAt && (perms.editTeam || isMe);
            return (
              <li
                key={m.id}
                className="flex min-h-16 items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold">
                    {nameOf(m)}
                    {isMe && m.displayName && (
                      <span className="font-normal text-slate-500"> (you)</span>
                    )}
                  </span>
                  {!perms.manageMembers && (
                    <span className="block text-sm text-slate-600">{ROLE_LABEL[m.role]}</span>
                  )}
                  {(kids.length > 0 || canLink) && (
                    <span className="block text-sm text-slate-600">
                      {kids.length > 0
                        ? `Parent of ${kids.map((p) => p.name).join(", ")}`
                        : "No player linked"}
                      {canLink && (
                        <>
                          {" · "}
                          <button
                            onClick={() => setKidsForMember(m)}
                            className="font-semibold text-[#0b1f3a] underline"
                          >
                            {kids.length > 0 ? "Change" : "Pick player"}
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </span>
                {perms.manageMembers ? (
                  <>
                    <select
                      aria-label={`Role for ${nameOf(m)}`}
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => run(() => setMemberRole(m.id, e.target.value as MemberRole))}
                      className="h-11 rounded-lg border-2 border-slate-300 bg-white px-2 text-base font-semibold"
                    >
                      {order.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    {!isMe && (
                      <button
                        onClick={() => setRemoving(m)}
                        aria-label={`Remove ${nameOf(m)}`}
                        className="h-11 rounded-lg px-2 text-base font-semibold text-red-700 active:bg-red-50"
                      >
                        Remove
                      </button>
                    )}
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {perms.manageMembers && data.invites.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            Open invite links
          </h2>
          <ul className="flex flex-col gap-2">
            {data.invites.map((inv) => (
              <InviteRow
                key={inv.id}
                invite={inv}
                busy={busy}
                onRevoke={() => run(() => revokeInvite(inv.id))}
              />
            ))}
          </ul>
        </section>
      )}

      <button
        onClick={() => {
          const me = data.members.find((m) => m.userId === data.me.userId);
          if (me) setRemoving(me);
        }}
        className="h-12 w-full text-base font-semibold text-slate-700 underline"
      >
        Leave this team
      </button>

      {canCallUp(data.me.role) && !data.team.optionedAt && (
        <section className="mt-4 rounded-xl border-2 border-slate-300 bg-white p-4">
          <h2 className="text-lg font-bold">Option this team</h2>
          <p className="mt-1 text-base text-slate-700">
            Season over? Send the team down: it&apos;s archived and read-only for everyone, and the
            app opens your other teams first. Call it back up any time.
          </p>
          <button
            onClick={() => setOptioning(true)}
            className="mt-3 h-12 w-full rounded-xl border-2 border-[#0b1f3a] text-base font-bold text-[#0b1f3a] active:bg-slate-100"
          >
            Option team
          </button>
          <p className="mt-2 text-sm text-slate-600">To delete a team, option it first.</p>
        </section>
      )}

      {canCallUp(data.me.role) && data.team.optionedAt && (
        <button
          onClick={() => {
            setConfirmName("");
            setDeleting(true);
          }}
          className="mt-2 h-12 w-full text-base font-semibold text-red-700 underline"
        >
          Delete this team
        </button>
      )}

      <Sheet
        open={kidsFor !== null}
        title={kidsFor ? `${nameOf(kidsFor)}: parent of` : "Players"}
        onClose={() => setKidsForMember(null)}
      >
        {kidsFor && (
          <KidsForm
            key={kidsFor.id}
            userId={kidsFor.userId}
            onDone={() => setKidsForMember(null)}
          />
        )}
      </Sheet>

      <Sheet open={optioning} title="Option this team?" onClose={() => setOptioning(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-lg leading-snug">
            <b>{data.team.name}</b> moves to your Optioned teams. Everyone keeps view-only access to
            its lineups and playing time; nothing can be changed until a coach calls it back up.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setOptioning(false)}
              className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setOptioning(false);
                setOptioned(true);
              }}
              className="h-14 flex-1 rounded-xl bg-[#0b1f3a] text-lg font-bold text-white active:bg-[#16325a]"
            >
              Option team
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet open={deleting} title="Delete this team?" onClose={() => setDeleting(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-lg leading-snug">
            This permanently deletes <b>{data.team.name}</b>: its roster, games, lineups, season
            playing time, members and invite links. It can&apos;t be undone.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-700">
              Type the team name to confirm
            </span>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
              placeholder={data.team.name}
              className="h-12 rounded-lg border-2 border-slate-400 bg-white px-3 text-lg focus:border-red-700 focus:outline-none"
            />
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleting(false)}
              className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
            >
              Cancel
            </button>
            <button
              disabled={busy || confirmName.trim() !== data.team.name.trim()}
              onClick={() => {
                setDeleting(false);
                void run(deleteTeam);
              }}
              className="h-14 flex-1 rounded-xl bg-red-700 text-lg font-bold text-white active:bg-red-800 disabled:opacity-40"
            >
              Delete team
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet open={created !== null} title="Share this link" onClose={() => setCreated(null)}>
        {created && <ShareLink role={created.role} url={created.url} />}
      </Sheet>

      <Sheet
        open={removing !== null}
        title={
          removing?.userId === data.me.userId
            ? "Leave this team?"
            : `Remove ${removing ? nameOf(removing) : ""}?`
        }
        onClose={() => setRemoving(null)}
      >
        <p className="mb-4 text-lg leading-snug">
          {removing?.userId === data.me.userId
            ? "You'll lose access to this team until someone invites you again."
            : "They'll lose access to this team. You can invite them again later."}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setRemoving(null)}
            className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={() => {
              const target = removing;
              setRemoving(null);
              if (!target) return;
              const leaving = target.userId === data.me.userId;
              void run(async () => {
                await removeMember(target.id);
                if (leaving) await signOut();
              });
            }}
            className="h-14 flex-1 rounded-xl bg-red-700 text-lg font-bold text-white active:bg-red-800 disabled:opacity-50"
          >
            {removing?.userId === data.me.userId ? "Leave" : "Remove"}
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}

function ShareLink({ role, url }: { role: MemberRole; url: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const message =
    role === "parent"
      ? "Join our team on RallyCap to see lineups and playing time:"
      : `You're invited to help ${role === "coach" ? "coach" : "manage"} our team on RallyCap:`;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-slate-700">
        {role === "parent"
          ? "Anyone with this link can join as a parent for the next 14 days. Post it in your team's group chat."
          : `This link works for one person for 7 days. Send it to your ${ROLE_LABEL[role].toLowerCase()} directly.`}
      </p>
      <p className="rounded-lg bg-slate-100 p-3 font-mono text-sm break-all">{url}</p>
      {canShare && (
        <button
          onClick={() =>
            void navigator.share({ title: "RallyCap invite", text: message, url }).catch(() => {})
          }
          className="h-14 rounded-xl bg-[#0b1f3a] text-lg font-bold text-white active:bg-[#16325a]"
        >
          Share…
        </button>
      )}
      <button
        onClick={() =>
          void navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
        }
        className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
      >
        {copied ? "Copied ✓" : "Copy link"}
      </button>
    </div>
  );
}

function InviteRow({
  invite,
  busy,
  onRevoke,
}: {
  invite: Invite;
  busy: boolean;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const who = invite.maxUses === null ? `Anyone · used ${invite.uses}×` : "One person";
  return (
    <li className="rounded-xl border-2 border-slate-200 bg-white p-3">
      <p className="text-base font-semibold">
        {ROLE_LABEL[invite.role]} link{" "}
        <span className="font-normal text-slate-600">
          · {who} · until {shortDate(invite.expiresAt)}
        </span>
      </p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() =>
            void navigator.clipboard.writeText(inviteUrl(invite.token)).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
          }
          className="h-11 flex-1 rounded-lg border-2 border-slate-300 text-base font-bold active:bg-slate-100"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <button
          disabled={busy}
          onClick={onRevoke}
          className="h-11 flex-1 rounded-lg border-2 border-red-300 text-base font-bold text-red-700 active:bg-red-50 disabled:opacity-50"
        >
          Turn off
        </button>
      </div>
    </li>
  );
}
