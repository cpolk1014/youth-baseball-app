"use client";

import { useEffect, useState } from "react";
import type { ClubPlan, ClubPlaySet } from "@/lib/data/club-backend";
import { newId } from "@/lib/data/store";
import { PLAYS } from "@/lib/plays/library";
import { PRACTICE_FOCUSES } from "@/lib/practice/drills";
import { Loading } from "../AppShell";
import { PlayPicker } from "../PlayPicker";
import { DrillPicker } from "../PracticeScreen";
import { Sheet } from "../Sheet";

const heading = "mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase";
const field =
  "h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-lg focus:border-[var(--team)] focus:outline-none";
const backend = () => import("@/lib/data/club-backend");

/** Practice plans and homework play sets the club's coaches can copy. */
export function ClubLibraryTab({ clubId }: { clubId: string }) {
  const [plans, setPlans] = useState<ClubPlan[] | null>(null);
  const [sets, setSets] = useState<ClubPlaySet[]>([]);
  const [plan, setPlan] = useState<ClubPlan | null>(null);
  const [set, setSet] = useState<ClubPlaySet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      const m = await backend();
      const [p, s] = await Promise.all([m.clubPlans(clubId), m.clubPlaySets(clubId)]);
      if (!current) return;
      setPlans(p);
      setSets(s);
    })().catch((e: unknown) => current && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      current = false;
    };
  }, [clubId]);

  if (!plans) return error ? <p className="text-base text-red-700">{error}</p> : <Loading />;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const minutes = (p: ClubPlan) => p.items.reduce((s, i) => s + i.minutes, 0);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      <section>
        <h2 className={heading}>Practice plans</h2>
        <p className="mb-3 text-base text-slate-700">
          Coaches see these under “Copy a plan” on any practice.
        </p>
        <ul className="grid gap-2 md:grid-cols-2">
          {plans.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setPlan(p)}
                className="flex w-full flex-col rounded-xl border-2 border-slate-200 bg-white p-3 text-left active:bg-slate-50"
              >
                <span className="text-lg font-bold">{p.title}</span>
                <span className="text-sm text-slate-600">
                  {p.focus ? `${p.focus} · ` : ""}
                  {p.items.length} drill{p.items.length === 1 ? "" : "s"} · {minutes(p)} min
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={() => setPlan({ id: newId(), title: "", focus: null, items: [] })}
          className="mt-2 h-14 w-full rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
        >
          + Add practice plan
        </button>
      </section>

      <section>
        <h2 className={heading}>Homework play sets</h2>
        <p className="mb-3 text-base text-slate-700">
          Coaches can start a homework assignment from these.
        </p>
        <ul className="grid gap-2 md:grid-cols-2">
          {sets.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setSet(s)}
                className="flex w-full flex-col rounded-xl border-2 border-slate-200 bg-white p-3 text-left active:bg-slate-50"
              >
                <span className="text-lg font-bold">{s.title}</span>
                <span className="text-sm text-slate-600">
                  {s.playIds.length} play{s.playIds.length === 1 ? "" : "s"}:{" "}
                  {s.playIds
                    .map((id) => PLAYS.find((p) => p.id === id)?.name)
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(", ")}
                  {s.playIds.length > 3 ? "…" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={() => setSet({ id: newId(), title: "", playIds: [] })}
          className="mt-2 h-14 w-full rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
        >
          + Add play set
        </button>
      </section>

      <Sheet
        open={plan !== null}
        title={plan?.title || "Practice plan"}
        onClose={() => setPlan(null)}
      >
        {plan && (
          <PlanEditor
            key={plan.id}
            plan={plan}
            isNew={!plans.some((p) => p.id === plan.id)}
            onCancel={() => setPlan(null)}
            onSave={(p) =>
              void run(async () => {
                await (await backend()).saveClubPlan(clubId, p);
                setPlans((cur) =>
                  [...(cur ?? []).filter((x) => x.id !== p.id), p].sort((a, b) =>
                    a.title.localeCompare(b.title),
                  ),
                );
                setPlan(null);
              })
            }
            onDelete={() =>
              void run(async () => {
                await (await backend()).deleteClubPlan(plan.id);
                setPlans((cur) => (cur ?? []).filter((x) => x.id !== plan.id));
                setPlan(null);
              })
            }
          />
        )}
      </Sheet>

      <Sheet open={set !== null} title={set?.title || "Play set"} onClose={() => setSet(null)}>
        {set && (
          <PlaySetEditor
            key={set.id}
            set={set}
            isNew={!sets.some((s) => s.id === set.id)}
            onCancel={() => setSet(null)}
            onSave={(s) =>
              void run(async () => {
                await (await backend()).saveClubPlaySet(clubId, s);
                setSets((cur) =>
                  [...cur.filter((x) => x.id !== s.id), s].sort((a, b) =>
                    a.title.localeCompare(b.title),
                  ),
                );
                setSet(null);
              })
            }
            onDelete={() =>
              void run(async () => {
                await (await backend()).deleteClubPlaySet(set.id);
                setSets((cur) => cur.filter((x) => x.id !== set.id));
                setSet(null);
              })
            }
          />
        )}
      </Sheet>
    </div>
  );
}

function PlanEditor({
  plan,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  plan: ClubPlan;
  isNew: boolean;
  onSave: (p: ClubPlan) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(plan.title);
  const [focus, setFocus] = useState(plan.focus ?? "");
  const [items, setItems] = useState(plan.items);
  const [adding, setAdding] = useState(false);
  const total = items.reduce((s, i) => s + i.minutes, 0);
  const valid = title.trim().length > 0 && items.length > 0;
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    setItems(next);
  };

  if (adding) {
    return (
      <div className="flex flex-col gap-3">
        <DrillPicker
          onAdd={(item) => {
            setItems([
              ...items,
              {
                title: item.title,
                minutes: item.minutes,
                ...(item.notes ? { notes: item.notes } : {}),
              },
            ]);
            setAdding(false);
          }}
        />
        <button onClick={() => setAdding(false)} className="h-12 text-base font-semibold underline">
          Back to the plan
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Name</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Infield day"
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Focus (optional)</span>
        <select value={focus} onChange={(e) => setFocus(e.target.value)} className={field}>
          <option value="">None</option>
          {PRACTICE_FOCUSES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="mb-2 text-base font-semibold">Drills · {total} min</p>
        <ol className="flex flex-col gap-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white p-2"
            >
              <span className="min-w-0 flex-1 text-base font-semibold">{it.title}</span>
              <input
                type="number"
                min={1}
                max={120}
                value={it.minutes}
                aria-label={`Minutes for ${it.title}`}
                onChange={(e) =>
                  setItems(
                    items.map((x, j) =>
                      j === i
                        ? { ...x, minutes: Math.max(1, Math.min(120, Number(e.target.value) || 1)) }
                        : x,
                    ),
                  )
                }
                className="h-11 w-16 rounded-lg border-2 border-slate-300 px-2 text-center text-base"
              />
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Move up"
                className="size-11 rounded-lg border-2 border-slate-300 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                aria-label="Move down"
                className="size-11 rounded-lg border-2 border-slate-300 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                aria-label={`Remove ${it.title}`}
                className="size-11 rounded-lg border-2 border-red-300 text-red-700"
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
        <button
          onClick={() => setAdding(true)}
          className="mt-2 h-12 w-full rounded-xl border-2 border-dashed border-slate-400 text-base font-bold active:bg-slate-100"
        >
          + Add a drill
        </button>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ ...plan, title: title.trim(), focus: focus || null, items })}
          disabled={!valid}
          className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
        >
          Save plan
        </button>
      </div>
      {!isNew && (
        <button onClick={onDelete} className="h-12 text-base font-semibold text-red-700 underline">
          Delete plan
        </button>
      )}
    </div>
  );
}

function PlaySetEditor({
  set,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  set: ClubPlaySet;
  isNew: boolean;
  onSave: (s: ClubPlaySet) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(set.title);
  const [playIds, setPlayIds] = useState(set.playIds);
  const valid = title.trim().length > 0 && playIds.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Name</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Bunt defense"
          className={field}
        />
      </label>
      <div>
        <p className="mb-2 text-base font-semibold">
          Plays <span className="text-slate-600">({playIds.length} picked)</span>
        </p>
        <PlayPicker selected={playIds} onChange={setPlayIds} />
      </div>
      <div className="sticky bottom-0 -mx-4 grid grid-cols-2 gap-2 bg-white px-4 pt-2 pb-1">
        <button
          onClick={onCancel}
          className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ ...set, title: title.trim(), playIds })}
          disabled={!valid}
          className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
        >
          Save set
        </button>
      </div>
      {!isNew && (
        <button onClick={onDelete} className="h-12 text-base font-semibold text-red-700 underline">
          Delete set
        </button>
      )}
    </div>
  );
}
