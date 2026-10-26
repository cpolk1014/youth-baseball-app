"use client";

import { useState } from "react";
import { ROLE_LABEL } from "@/lib/data/permissions";
import { switchTeam } from "@/lib/data/store";
import type { TeamSummary } from "@/lib/data/types";
import { TeamSetup } from "./DataStatus";
import { Sheet } from "./Sheet";

/** "Your teams" sheet: switch teams (with your role on each) or start a new one. */
export function TeamSwitcher({
  open,
  onClose,
  teams,
  currentTeamId,
}: {
  open: boolean;
  onClose: () => void;
  teams: TeamSummary[];
  currentTeamId: string;
}) {
  const [creating, setCreating] = useState(false);
  const close = () => {
    setCreating(false);
    onClose();
  };

  return (
    <Sheet open={open} title={creating ? "Start a new team" : "Your teams"} onClose={close}>
      {creating ? (
        <div className="flex flex-col gap-3">
          <p className="text-base text-slate-700">
            You&apos;ll be the coach. Invite others from Roster afterwards.
          </p>
          <TeamSetup hasTeam={false} newTeam onCreated={close} />
          <button
            onClick={() => setCreating(false)}
            className="h-12 text-base font-semibold text-slate-700 underline"
          >
            Back to your teams
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <TeamList
            teams={teams.filter((t) => !t.optioned)}
            currentTeamId={currentTeamId}
            onPick={close}
          />
          {teams.some((t) => t.optioned) && (
            <>
              <h3 className="mt-3 text-sm font-bold tracking-wide text-slate-600 uppercase">
                Optioned
              </h3>
              <TeamList
                teams={teams.filter((t) => t.optioned)}
                currentTeamId={currentTeamId}
                onPick={close}
              />
            </>
          )}
          <button
            onClick={() => setCreating(true)}
            className="mt-2 h-14 rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
          >
            + Start a new team
          </button>
          <p className="text-sm text-slate-600">
            Joining another team? Open the invite link its coach shared.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function TeamList({
  teams,
  currentTeamId,
  onPick,
}: {
  teams: TeamSummary[];
  currentTeamId: string;
  onPick: () => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {teams.map((t) => {
        const current = t.id === currentTeamId;
        return (
          <li key={t.id}>
            <button
              onClick={() => {
                switchTeam(t.id);
                onPick();
              }}
              aria-current={current ? "true" : undefined}
              className={`flex min-h-16 w-full items-center gap-3 rounded-xl border-2 px-4 text-left ${
                current
                  ? "border-[#0b1f3a] bg-slate-50"
                  : "border-slate-200 bg-white active:bg-slate-50"
              } ${t.optioned ? "opacity-70" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold">{t.name}</span>
                <span className="block text-sm text-slate-600">
                  {t.ageGroup} · {ROLE_LABEL[t.role]}
                  {t.optioned ? " · Optioned" : ""}
                </span>
              </span>
              {current && <span className="text-xl font-bold text-[#0b1f3a]">✓</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
