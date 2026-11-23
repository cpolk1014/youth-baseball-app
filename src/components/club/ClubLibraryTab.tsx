"use client";

import { useEffect, useRef, useState } from "react";
import type { ClubPlan, ClubPlaySet } from "@/lib/data/club-backend";
import { newId } from "@/lib/data/store";
import { PLAYS } from "@/lib/plays/library";
import { Loading } from "../AppShell";
import { PlayDetail } from "../PlayDetail";
import { PlayPicker } from "../PlayPicker";
import { Sheet } from "../Sheet";
import { ClubPlanEditor } from "./ClubPlanEditor";
import { ClubPlanReader } from "./ClubPlanReader";

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
  const [reading, setReading] = useState(false);
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
        <button
          onClick={() => setReading(true)}
          className="mt-2 h-14 w-full rounded-xl border-2 border-[var(--team)] bg-white text-lg font-bold text-[var(--team)] active:bg-slate-50"
        >
          ✨ Read plans from a PDF or picture
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
          <ClubPlanEditor
            key={plan.id}
            plan={plan}
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
            onDelete={
              plans.some((p) => p.id === plan.id)
                ? () =>
                    void run(async () => {
                      await (await backend()).deleteClubPlan(plan.id);
                      setPlans((cur) => (cur ?? []).filter((x) => x.id !== plan.id));
                      setPlan(null);
                    })
                : undefined
            }
          />
        )}
      </Sheet>

      <Sheet open={reading} title="Read practice plans" onClose={() => setReading(false)}>
        {reading && (
          <ClubPlanReader
            clubId={clubId}
            onDone={() => setReading(false)}
            onSave={async (read) => {
              const m = await backend();
              for (const p of read) await m.saveClubPlan(clubId, p);
              setPlans((cur) =>
                [...(cur ?? []), ...read].sort((a, b) => a.title.localeCompare(b.title)),
              );
            }}
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
  const [watching, setWatching] = useState<string | null>(null);
  const valid = title.trim().length > 0 && playIds.length > 0;
  const play = watching ? PLAYS.find((p) => p.id === watching) : undefined;
  const top = useRef<HTMLDivElement>(null);
  // Open the play from its top, not wherever the list was scrolled to.
  useEffect(() => {
    if (watching) top.current?.scrollIntoView({ block: "start" });
  }, [watching]);

  if (play) {
    const picked = playIds.includes(play.id);
    return (
      <div ref={top} className="flex scroll-mt-4 flex-col gap-4">
        <PlayDetail play={play} />
        <div className="sticky bottom-0 -mx-4 grid grid-cols-2 gap-2 bg-white px-4 pt-2 pb-1">
          <button
            onClick={() => setWatching(null)}
            className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
          >
            Back to the set
          </button>
          <button
            onClick={() => {
              setPlayIds(
                picked
                  ? playIds.filter((x) => x !== play.id)
                  : PLAYS.map((p) => p.id).filter((x) => x === play.id || playIds.includes(x)),
              );
              setWatching(null);
            }}
            className={`h-14 rounded-xl text-lg font-bold ${picked ? "border-2 border-red-300 text-red-700" : "bg-[var(--team)] text-white"}`}
          >
            {picked ? "Take it out" : "Add to the set"}
          </button>
        </div>
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
          placeholder="Bunt defense"
          className={field}
        />
      </label>
      <div>
        <p className="mb-2 text-base font-semibold">
          Plays <span className="text-slate-600">({playIds.length} picked)</span>
        </p>
        <p className="mb-2 text-sm text-slate-600">Tap ▶ to watch a play before you add it.</p>
        <PlayPicker selected={playIds} onChange={setPlayIds} onWatch={setWatching} />
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
