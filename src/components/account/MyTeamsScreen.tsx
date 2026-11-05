"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppData, useStoreState } from "@/lib/data/store";
import { AppShell, Loading } from "../AppShell";
import { TeamSetup } from "../DataStatus";
import { TeamList } from "../TeamSwitcher";

/** My Teams: every team I'm on (and my role), switch between them, or start a new one. */
export function MyTeamsScreen() {
  const data = useAppData();
  const { status } = useStoreState();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const teams = data?.myTeams ?? [];

  return (
    <AppShell brand title="My teams" tab="account" bare>
      {status.kind === "loading" ? (
        <Loading />
      ) : creating || teams.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-base text-slate-700">
            You&apos;ll be the team&apos;s Owner. Invite coaches and parents from Coaches &amp;
            parents afterwards.
          </p>
          <TeamSetup hasTeam={false} newTeam onCreated={() => router.push("/games")} />
          {teams.length > 0 && (
            <button
              onClick={() => setCreating(false)}
              className="h-12 text-base font-semibold text-slate-700 underline"
            >
              Back to my teams
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-base text-slate-700">Tap a team to switch to it.</p>
          <TeamList
            teams={teams}
            currentTeamId={data?.team.id ?? ""}
            onPick={() => router.push("/games")}
          />
          <button
            onClick={() => setCreating(true)}
            className="h-14 rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
          >
            + Start a new team
          </button>
        </div>
      )}
    </AppShell>
  );
}
