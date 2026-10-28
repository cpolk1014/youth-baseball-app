"use client";

import { useState } from "react";
import { permissionsFor } from "@/lib/data/permissions";
import {
  disconnectGroupMe,
  postToGroupMe,
  saveGroupMe,
  useAppData,
  useStoreState,
} from "@/lib/data/store";
import { isBotId } from "@/lib/groupme/bot";
import { AppShell, Loading } from "./AppShell";
import { GroupMePost } from "./GroupMePost";

const field =
  "h-12 w-full min-w-0 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[#0b1f3a] focus:outline-none";
const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";

export function GroupMeScreen() {
  const data = useAppData();
  const { mode } = useStoreState();
  const [changing, setChanging] = useState(false);

  if (!data) {
    return (
      <AppShell title="GroupMe" backHref="/roster" tab="roster">
        <Loading />
      </AppShell>
    );
  }
  const canManage = permissionsFor(data.me.role, data.team.optionedAt !== null).editTeam;
  const shell = (children: React.ReactNode) => (
    <AppShell title="GroupMe" subtitle={data.team.name} backHref="/roster" tab="roster">
      {children}
    </AppShell>
  );
  if (mode !== "supabase") return shell(<p className="text-lg">GroupMe needs sign-in.</p>);
  if (!canManage) {
    return shell(<p className="text-lg">Coaches and managers post to the team&apos;s GroupMe.</p>);
  }

  if (!data.groupme || changing) {
    return shell(
      <ConnectForm
        initialBotId={data.groupme?.botId ?? ""}
        initialGroup={data.groupme?.groupName ?? ""}
        onDone={() => setChanging(false)}
        onCancel={data.groupme ? () => setChanging(false) : undefined}
      />,
    );
  }

  return shell(
    <>
      <section className="mb-5 flex items-center gap-3 rounded-xl border-2 border-green-700 bg-green-50 p-4">
        <span aria-hidden="true" className="text-2xl">
          ✓
        </span>
        <p className="min-w-0 flex-1 text-base">
          Connected to <strong>{data.groupme.groupName ?? "your team's group"}</strong>. Posts show
          up from the RallyCap bot.
        </p>
      </section>

      <section className="mb-6">
        <h2 className={heading}>Send a message to the team</h2>
        <GroupMePost
          initialText=""
          rows={4}
          placeholder="Practice moved to 6:00 tonight, Field 3."
        />
        <p className="mt-2 text-sm text-slate-600">
          To post a game&apos;s batting order, open the game and tap “Post batting order to
          GroupMe”. New Bat Arounds offer a post when you save them.
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => setChanging(true)}
          className="h-12 rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100"
        >
          Change bot
        </button>
        <button
          onClick={() => void disconnectGroupMe()}
          className="h-12 text-base font-semibold text-red-700 underline"
        >
          Disconnect GroupMe
        </button>
      </div>
    </>,
  );
}

function ConnectForm({
  initialBotId,
  initialGroup,
  onDone,
  onCancel,
}: {
  initialBotId: string;
  initialGroup: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [botId, setBotId] = useState(initialBotId);
  const [group, setGroup] = useState(initialGroup);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanId = botId.trim();

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveGroupMe(cleanId, group.trim() || null);
      // A test post proves the bot ID works and that it's in the right group.
      await postToGroupMe("👋 RallyCap is connected. Lineups and team updates will show up here.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border-2 border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-bold">Connect your team&apos;s GroupMe</h2>
        <p className="mb-3 text-base text-slate-700">
          A one-time setup. You add a “RallyCap” bot to the team&apos;s group, and the app posts
          through it.
        </p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-base">
          <li>
            Open{" "}
            <a
              href="https://dev.groupme.com/bots"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#0b1f3a] underline"
            >
              dev.groupme.com/bots
            </a>{" "}
            and log in with your GroupMe account.
          </li>
          <li>
            Tap <strong>Create Bot</strong>. Pick your team&apos;s group, name it{" "}
            <strong>RallyCap</strong>, and leave the other boxes empty.
          </li>
          <li>
            Copy the <strong>Bot ID</strong> it shows (a long string of letters and numbers) and
            paste it below.
          </li>
        </ol>
      </section>

      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Bot ID</span>
        <input
          value={botId}
          onChange={(e) => setBotId(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="e.g. 7f3c2a9d01b84e6f5a0c3d2e1b"
          className={`${field} font-mono`}
        />
        {cleanId !== "" && !isBotId(cleanId) && (
          <span className="text-sm text-red-700">
            That doesn&apos;t look like a Bot ID. It&apos;s only letters and numbers.
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Group name (optional)</span>
        <input
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          maxLength={80}
          placeholder="Canes 7U Parents"
          className={field}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}

      <div className={`grid gap-2 ${onCancel ? "grid-cols-2" : ""}`}>
        {onCancel && (
          <button
            onClick={onCancel}
            className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => void connect()}
          disabled={!isBotId(cleanId) || busy}
          className="h-14 rounded-xl bg-[#00aff0] text-lg font-bold text-white active:bg-[#0096cc] disabled:opacity-40"
        >
          {busy ? "Connecting…" : "Connect & send a test"}
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Only coaches and managers can see the Bot ID or post. Parents just see the posts in GroupMe.
      </p>
    </div>
  );
}
