"use client";

import { useState } from "react";
import { newId, useAppData } from "@/lib/data/store";
import { describeCustomRule, type TeamShape } from "@/lib/rules/custom";
import { draftToRule, type Interpretation } from "@/lib/rules/interpret";
import type { CustomRule, RuleConfig } from "@/lib/rules/types";
import { ruleProblems } from "./CustomRuleForm";

/** A coach types a rule; Claude maps it to rule types (or asks); the app checks it. */
export function TypedRuleForm({
  config,
  team,
  onAdd,
  onCancel,
}: {
  config: RuleConfig;
  team: TeamShape;
  onAdd: (rules: CustomRule[]) => void;
  onCancel: () => void;
}) {
  const data = useAppData()!;
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Interpretation | null>(null);
  const [rules, setRules] = useState<CustomRule[]>([]);

  const ask = async (withAnswers: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rules/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: data.team.id, text, answers: withAnswers }),
      });
      const body = (await res.json().catch(() => null)) as
        (Interpretation & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error ?? "Couldn't check the rule. Try again.");
      setResult(body);
      setRules(
        body.rules
          .map((d) => draftToRule(d, team.players, newId(), team.innings))
          .filter((r): r is CustomRule => r !== null),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check the rule.");
    } finally {
      setBusy(false);
    }
  };

  const problemsFor = (rule: CustomRule, earlier: CustomRule[]) =>
    ruleProblems(rule, { ...config, custom: [...config.custom, ...earlier] }, team);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Type a rule</span>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
            setAnswers([]);
          }}
          rows={3}
          maxLength={500}
          placeholder="No kid catches more than 2 innings. Owen never pitches."
          className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-lg focus:border-[var(--team)] focus:outline-none"
        />
      </label>
      {!result && (
        <button
          onClick={() => void ask([])}
          disabled={!text.trim() || busy}
          className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40"
        >
          {busy ? "Checking…" : "Check this rule"}
        </button>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-3" aria-live="polite">
          {result.note && <p className="rounded-xl bg-slate-100 p-3 text-base">{result.note}</p>}

          {result.outcome === "clarify" && result.question && (
            <div>
              <p className="mb-2 text-lg font-semibold">{result.question}</p>
              <div className="flex flex-col gap-2">
                {result.options.map((o) => (
                  <button
                    key={o}
                    disabled={busy}
                    onClick={() => {
                      const next = [...answers, o];
                      setAnswers(next);
                      void ask(next);
                    }}
                    className="min-h-12 rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-left text-base font-semibold active:bg-slate-50 disabled:opacity-40"
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}

          {rules.length > 0 && (
            <ul className="flex flex-col gap-2">
              {rules.map((r, i) => {
                const problems = problemsFor(r, rules.slice(0, i));
                return (
                  <li key={r.id} className="rounded-xl border-2 border-slate-300 bg-white p-3">
                    <p className="text-lg font-semibold">“{describeCustomRule(r, data.players)}”</p>
                    <p className="text-sm text-slate-600">
                      {r.setting === "block" ? "Must follow" : "Warning only"}
                    </p>
                    {problems.map((p) => (
                      <p key={p} className="mt-1 text-base text-amber-900">
                        ⚠ {p}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}

          {result.outcome !== "clarify" && rules.length === 0 && (
            <p className="text-base text-slate-700">Nothing to add. Try wording it another way.</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setResult(null);
                setAnswers([]);
              }}
              className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
            >
              Edit
            </button>
            <button
              disabled={rules.length === 0}
              onClick={() => onAdd(rules)}
              className="h-14 rounded-xl bg-green-700 text-lg font-bold text-white active:bg-green-800 disabled:opacity-40"
            >
              {rules.length > 1 ? `Add ${rules.length} rules` : "Add rule"}
            </button>
          </div>
        </div>
      )}
      <button onClick={onCancel} className="h-12 text-base font-semibold text-slate-700 underline">
        Cancel
      </button>
    </div>
  );
}
