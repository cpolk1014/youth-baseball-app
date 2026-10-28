"use client";

import { useState } from "react";
import { permissionsFor } from "@/lib/data/permissions";
import { saveSeasonRules, useAppData } from "@/lib/data/store";
import {
  CORE_RULE_TEXT,
  isChanged,
  recommendedRules,
  rulesFor,
  setRuleNumber,
  setRuleSetting,
  type RuleInfo,
} from "@/lib/rules/catalog";
import { resolveRuleConfig, type RuleConfigInput } from "@/lib/rules/config";
import type { RuleConfig, RuleSetting } from "@/lib/rules/types";
import { AppShell, Loading } from "./AppShell";
import { Sheet } from "./Sheet";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const SETTINGS: { id: RuleSetting; label: string }[] = [
  { id: "block", label: "Must" },
  { id: "warn", label: "Warn" },
  { id: "off", label: "Off" },
];

/** The season's fair-play rules: must follow, warn or off, with each rule's number. */
export function FairPlayScreen() {
  const data = useAppData();
  const [confirmReset, setConfirmReset] = useState(false);

  if (!data) {
    return (
      <AppShell title="Fair play rules" backHref="/season" tab="season">
        <Loading />
      </AppShell>
    );
  }

  const canEdit = permissionsFor(data.me.role, data.team.optionedAt !== null).editLineups;
  const input: RuleConfigInput = data.season.fairPlayRules ?? {};
  const config = { ...resolveRuleConfig(input), coachPitch: data.team.coachPitch };
  const rules = rulesFor(data.team.coachPitch);
  const changed = rules.some((r) => isChanged(config, r));
  const save = (next: RuleConfigInput) => saveSeasonRules(next);

  return (
    <AppShell
      title="Fair play rules"
      subtitle={`${data.team.coachPitch ? "Coach pitch" : "Kid pitch"} · ${data.season.name}`}
      backHref="/season"
      tab="season"
    >
      <p className="mb-4 text-base text-slate-700">
        <strong>Must</strong>: auto-fill always follows it, and breaking it is flagged in red.{" "}
        <strong>Warn</strong>: auto-fill tries to follow it; breaking it shows a yellow warning.{" "}
        <strong>Off</strong>: ignored. Changes apply to lineups from now on.
      </p>

      <section className="mb-5">
        <h2 className={heading}>Always on</h2>
        <ul className="rounded-xl border-2 border-slate-200 bg-white p-3 text-base text-slate-700">
          {CORE_RULE_TEXT.map((t) => (
            <li key={t} className="py-0.5">
              ✓ {t}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-5">
        <h2 className={heading}>
          {data.team.coachPitch ? "Coach pitch rules" : "Kid pitch rules"}
        </h2>
        <ul className="grid gap-2 md:grid-cols-2 md:items-start">
          {rules.map((r) => (
            <RuleRow
              key={r.id}
              info={r}
              config={config}
              canEdit={canEdit}
              onSetting={(s) => save(setRuleSetting(input, r.id, s))}
              onNumber={(n) => save(setRuleNumber(input, r, n))}
            />
          ))}
        </ul>
        {data.team.coachPitch && (
          <p className="mt-2 text-sm text-slate-600">
            Pitching rules are hidden: in coach&apos;s pitch, P is a fielding spot.
          </p>
        )}
      </section>

      {canEdit && changed && (
        <button
          onClick={() => setConfirmReset(true)}
          className="h-12 w-full rounded-xl border-2 border-slate-400 bg-white text-base font-bold active:bg-slate-100"
        >
          Reset to recommended
        </button>
      )}
      {!canEdit && <p className="text-base text-slate-600">Coaches set these rules.</p>}

      <Sheet
        open={confirmReset}
        title="Reset to recommended?"
        onClose={() => setConfirmReset(false)}
      >
        <p className="mb-4 text-lg">
          Every rule goes back to the recommended setting for{" "}
          {data.team.coachPitch ? "coach pitch" : "kid pitch"}.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setConfirmReset(false)}
            className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
          >
            Keep mine
          </button>
          <button
            onClick={() => {
              save(recommendedRules());
              setConfirmReset(false);
            }}
            className="h-14 rounded-xl bg-[#0b1f3a] text-lg font-bold text-white active:bg-[#152f55]"
          >
            Reset
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}

function RuleRow({
  info,
  config,
  canEdit,
  onSetting,
  onNumber,
}: {
  info: RuleInfo;
  config: RuleConfig;
  canEdit: boolean;
  onSetting: (s: RuleSetting) => void;
  onNumber: (n: number) => void;
}) {
  const setting = config.severity[info.id];
  const options = SETTINGS.filter((s) => info.canBlock || s.id !== "block");
  const num = info.number ? (config[info.number.key] ?? info.number.min) : null;
  const step = info.number?.step ?? 1;
  const stepper =
    "flex size-11 items-center justify-center rounded-lg border-2 border-slate-300 bg-white text-xl font-bold active:bg-slate-100 disabled:opacity-30";

  return (
    <li
      className={`rounded-xl border-2 bg-white p-3 ${setting === "off" ? "border-slate-200 opacity-70" : "border-slate-300"}`}
    >
      <p className="text-base leading-snug font-semibold">{info.describe(config)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Setting"
          className="flex rounded-lg border-2 border-slate-300 p-0.5"
        >
          {options.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={setting === o.id}
              disabled={!canEdit}
              onClick={() => onSetting(o.id)}
              className={`h-10 min-w-14 rounded-md px-3 text-base font-bold ${
                setting === o.id
                  ? o.id === "block"
                    ? "bg-red-700 text-white"
                    : o.id === "warn"
                      ? "bg-amber-400 text-slate-900"
                      : "bg-slate-600 text-white"
                  : "text-slate-700"
              } disabled:cursor-default`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {info.number && num !== null && setting !== "off" && canEdit && (
          <div className="ml-auto flex items-center gap-1">
            <button
              aria-label="Lower"
              disabled={num <= info.number.min}
              onClick={() => onNumber(num - step)}
              className={stepper}
            >
              −
            </button>
            <span className="w-12 text-center text-lg font-bold">
              {info.number.key === "minInningsPlayedPercent" ? `${num}%` : num}
            </span>
            <button
              aria-label="Raise"
              disabled={num >= info.number.max}
              onClick={() => onNumber(num + step)}
              className={stepper}
            >
              +
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
