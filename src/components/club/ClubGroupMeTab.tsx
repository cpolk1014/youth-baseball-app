"use client";

import { useEffect, useState } from "react";
import type { ClubGroupMe, ClubTarget } from "@/lib/data/club-backend";
import { isBotId } from "@/lib/groupme/bot";
import { Loading } from "../AppShell";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const field =
  "h-12 w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const backend = () => import("@/lib/data/club-backend");

/** Post to the club's coaches group and to any (or every) club team's group. */
export function ClubGroupMeTab({ clubId }: { clubId: string }) {
  const [coaches, setCoaches] = useState<ClubGroupMe | null | "loading">("loading");
  const [targets, setTargets] = useState<ClubTarget[]>([]);
  const [changing, setChanging] = useState(false);
  const [toCoaches, setToCoaches] = useState(true);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      const m = await backend();
      const [g, t] = await Promise.all([m.clubGroupMe(clubId), m.clubTargets(clubId)]);
      if (!current) return;
      setCoaches(g);
      setTargets(t);
    })().catch((e: unknown) => current && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      current = false;
    };
  }, [clubId]);

  if (coaches === "loading")
    return error ? <p className="text-base text-red-700">{error}</p> : <Loading />;

  const connected = targets.filter((t) => t.connected);
  const allTeams = connected.length > 0 && connected.every((t) => teamIds.includes(t.teamId));
  const groups = (toCoaches && coaches ? 1 : 0) + teamIds.length;

  const post = async () => {
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const n = await (await backend()).clubPost(clubId, toCoaches && !!coaches, teamIds, text);
      setSent(`Posted to ${n} group${n === 1 ? "" : "s"}.`);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {!coaches || changing ? (
        <CoachesGroupForm
          clubId={clubId}
          initial={coaches}
          onDone={(g) => {
            setCoaches(g);
            setChanging(false);
          }}
          onCancel={coaches ? () => setChanging(false) : undefined}
        />
      ) : (
        <section className="flex items-center gap-3 rounded-xl border-2 border-green-700 bg-green-50 p-4">
          <p className="min-w-0 flex-1 text-base">
            Coaches group: <b>{coaches.groupName ?? "connected"}</b>
          </p>
          <button
            onClick={() => setChanging(true)}
            className="h-11 shrink-0 rounded-lg border-2 border-slate-400 bg-white px-3 text-base font-bold"
          >
            Change
          </button>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className={heading}>Post a message</h2>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSent(null);
          }}
          rows={5}
          maxLength={1000}
          placeholder="Tryouts for next season are July 12 at Chabills Field."
          className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-base focus:border-[var(--team)] focus:outline-none"
        />
        <p className="-mt-2 text-right text-sm text-slate-600">{text.length}/1000</p>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-semibold">Send to</legend>
          <Check
            label="Coaches group"
            checked={toCoaches && !!coaches}
            disabled={!coaches}
            onChange={setToCoaches}
          />
          <Check
            label={`All team groups (${connected.length})`}
            checked={allTeams}
            disabled={connected.length === 0}
            onChange={(on) => setTeamIds(on ? connected.map((t) => t.teamId) : [])}
          />
          <details className="rounded-xl border-2 border-slate-200 bg-white px-3">
            <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold">
              Pick teams ({teamIds.length} picked)
            </summary>
            <div className="flex flex-col gap-1 pb-2">
              {targets.map((t) => (
                <Check
                  key={t.teamId}
                  label={`${t.name} (${t.ageGroup})${t.connected ? "" : " · no GroupMe yet"}`}
                  checked={teamIds.includes(t.teamId)}
                  disabled={!t.connected}
                  onChange={(on) =>
                    setTeamIds(on ? [...teamIds, t.teamId] : teamIds.filter((x) => x !== t.teamId))
                  }
                />
              ))}
            </div>
          </details>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
            {error}
          </p>
        )}
        {sent && (
          <p
            role="status"
            className="rounded-xl bg-green-50 p-3 text-base font-semibold text-green-900"
          >
            {sent}
          </p>
        )}
        <button
          onClick={() => void post()}
          disabled={!text.trim() || groups === 0 || busy}
          className="h-14 rounded-xl bg-[#00aff0] text-lg font-bold text-white active:bg-[#0096cc] disabled:opacity-40"
        >
          {busy ? "Posting…" : `Post to ${groups} group${groups === 1 ? "" : "s"}`}
        </button>
        <p className="text-sm text-slate-600">
          Team groups post through each team&apos;s own RallyCap bot, set up by its coach. Up to 20
          club posts an hour.
        </p>
      </section>
    </div>
  );
}

function Check({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-12 items-center gap-3 text-base ${disabled ? "text-slate-400" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-6 shrink-0"
      />
      {label}
    </label>
  );
}

function CoachesGroupForm({
  clubId,
  initial,
  onDone,
  onCancel,
}: {
  clubId: string;
  initial: ClubGroupMe | null;
  onDone: (g: ClubGroupMe) => void;
  onCancel?: () => void;
}) {
  const [botId, setBotId] = useState(initial?.botId ?? "");
  const [group, setGroup] = useState(initial?.groupName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = botId.trim();

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const m = await backend();
      await m.saveClubGroupMe(clubId, id, group.trim() || null);
      // A test post proves the bot works and is in the right group.
      await m.clubPost(clubId, true, [], "👋 RallyCap is connected to the club's coaches group.");
      onDone({ botId: id, groupName: group.trim() || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border-2 border-slate-200 bg-white p-4">
      <h2 className={heading}>Connect the coaches group</h2>
      <ol className="list-decimal pl-5 text-base leading-snug">
        <li>
          On dev.groupme.com, sign in and choose <b>Bots → Create Bot</b>.
        </li>
        <li>
          Pick the club&apos;s coaches group and name the bot <b>RallyCap</b>.
        </li>
        <li>
          Copy its <b>Bot ID</b> and paste it here.
        </li>
      </ol>
      <input
        value={botId}
        onChange={(e) => setBotId(e.target.value)}
        placeholder="Bot ID"
        aria-label="Bot ID"
        className={field}
        autoComplete="off"
      />
      <input
        value={group}
        onChange={(e) => setGroup(e.target.value)}
        placeholder="Group name (optional)"
        aria-label="Group name"
        maxLength={80}
        className={field}
      />
      {error && (
        <p role="alert" className="text-base font-semibold text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => void connect()}
          disabled={!isBotId(id) || busy}
          className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
        >
          {busy ? "Connecting…" : "Connect and send a test"}
        </button>
      </div>
    </section>
  );
}
