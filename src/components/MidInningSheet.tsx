"use client";

// A change in the middle of an inning (one hand, in the dugout): when it happened (after how
// many outs), then what happened (a pitching change, two players swapping, a sub from the
// bench), a preview of every move, and Save. Also lists the inning's changes so far, with Undo.
import { useState } from "react";
import {
  changeMidInning,
  inningParts,
  isSplitInning,
  pitchingChangeMoves,
  positionAtOut,
  undoMidInning,
  type Move,
} from "@/lib/lineup/edit";
import type { FieldPosition, Lineup, Player, Position } from "@/lib/rules/types";
import { positionClass, positionLabel } from "./positionStyle";

type Kind = "pitching" | "swap" | "sub";

const WHEN: { out: number; label: string }[] = [
  { out: 0, label: "No outs" },
  { out: 1, label: "1 out" },
  { out: 2, label: "2 outs" },
  { out: 1.5, label: "Not sure" },
];

const big =
  "flex min-h-14 items-center justify-center rounded-xl border-2 px-3 text-lg font-bold active:opacity-80";
const pickedCls = "border-[var(--team)] bg-[var(--team)] text-white";
const idleCls = "border-slate-300 bg-white";

export function MidInningSheet({
  lineup,
  inning,
  players,
  positions,
  startPlayerId,
  onSave,
}: {
  lineup: Lineup;
  inning: number;
  players: Map<string, Player>;
  positions: FieldPosition[];
  /** Opened from a kid's square: start with them (the new pitcher, or the one to swap). */
  startPlayerId?: string;
  onSave: (next: Lineup, note: string) => void;
}) {
  const [at, setAt] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [first, setFirst] = useState<string | null>(startPlayerId ?? null);
  const [second, setSecond] = useState<string | null>(null);
  const [oldPitcherTo, setOldPitcherTo] = useState<Position | null>(null);

  const name = (id: string) => players.get(id)?.name ?? "?";
  const ids = [...new Set(lineup.slots.filter((s) => s.inning === inning).map((s) => s.playerId))];
  const spotAt = (id: string) => (at === null ? null : positionAtOut(lineup, inning, id, at));
  const onField = ids.filter((id) => {
    const p = spotAt(id);
    return p !== null && p !== "BENCH";
  });
  const onBench = ids.filter((id) => spotAt(id) === "BENCH");

  let moves: Move[] = [];
  if (at !== null && kind === "pitching" && first) {
    moves = pitchingChangeMoves(lineup, inning, at, first, oldPitcherTo ?? undefined);
  } else if (at !== null && kind === "swap" && first && second) {
    const a = spotAt(first);
    const b = spotAt(second);
    if (a && b)
      moves = [
        { playerId: first, to: b },
        { playerId: second, to: a },
      ];
  } else if (at !== null && kind === "sub" && first && second) {
    const spot = spotAt(second);
    if (spot)
      moves = [
        { playerId: first, to: spot },
        { playerId: second, to: "BENCH" },
      ];
  }
  const moveText = (m: Move) =>
    `${name(m.playerId)}: ${positionLabel(spotAt(m.playerId))} → ${positionLabel(m.to)}`;
  const whenText = (out: number) =>
    out === 1.5
      ? "partway through (about halfway)"
      : `after ${out === 0 ? "no outs" : out === 1 ? "1 out" : "2 outs"}`;

  const save = () => {
    if (at === null || !moves.length) return;
    const next = changeMidInning(lineup, inning, at, moves, at === 1.5);
    onSave(next, `Inning ${inning}, ${whenText(at)}: ${moves.map(moveText).join(", ")}`);
  };

  // What changed in this inning already (kids with more than one part).
  const changed = ids
    .map((id) => ({ id, parts: inningParts(lineup, inning, id) }))
    .filter((x) => x.parts.length > 1);
  const pitcher = ids.find((id) => spotAt(id) === "P");
  const chooser = (
    list: string[],
    value: string | null,
    set: (id: string) => void,
    hint?: (id: string) => string,
  ) => (
    <div className="grid grid-cols-2 gap-2">
      {list.map((id) => (
        <button
          key={id}
          onClick={() => set(id)}
          aria-pressed={value === id}
          className={`${big} flex-col !items-start !text-base ${value === id ? pickedCls : idleCls}`}
        >
          <span className="truncate">{name(id)}</span>
          <span
            className={`text-sm font-semibold ${value === id ? "text-white/80" : "text-slate-500"}`}
          >
            {hint ? hint(id) : positionLabel(spotAt(id))}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {isSplitInning(lineup, inning) && (
        <section className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-bold tracking-wide text-slate-600 uppercase">
            This inning so far
          </p>
          <ul className="flex flex-col gap-1 text-base">
            {changed.map(({ id, parts }) => (
              <li key={id}>
                <b>{name(id)}</b>: {parts.map((p) => positionLabel(p.position)).join(" → ")}
                {parts.some((p) => p.estimated) && (
                  <span className="text-slate-500"> (about halfway)</span>
                )}
              </li>
            ))}
          </ul>
          <button
            onClick={() =>
              onSave(undoMidInning(lineup, inning), `Took back the changes in inning ${inning}`)
            }
            className="h-12 rounded-xl border-2 border-red-300 bg-white text-base font-bold text-red-700"
          >
            Undo this inning&apos;s changes
          </button>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-base font-bold">When did it happen?</h3>
        <div className="grid grid-cols-4 gap-2">
          {WHEN.map((w) => (
            <button
              key={w.label}
              onClick={() => setAt(w.out)}
              aria-pressed={at === w.out}
              className={`${big} !px-1 !text-base ${at === w.out ? pickedCls : idleCls}`}
            >
              {w.label}
            </button>
          ))}
        </div>
        {at === 1.5 && (
          <p className="text-sm text-slate-600">
            Counted as halfway through the inning, and marked &quot;about&quot; in playing time.
          </p>
        )}
      </section>

      {at !== null && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-bold">What happened?</h3>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["pitching", "Pitching change"],
                ["swap", "Swap two"],
                ["sub", "Sub from bench"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  setSecond(null);
                  setOldPitcherTo(null);
                  if (k === "sub") setFirst(null);
                }}
                aria-pressed={kind === k}
                className={`${big} !px-1 !text-base leading-tight ${kind === k ? pickedCls : idleCls}`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      {at !== null && kind === "pitching" && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-bold">
            Who&apos;s pitching now?
            {pitcher && <span className="font-normal text-slate-600"> ({name(pitcher)} was)</span>}
          </h3>
          {chooser(
            onField
              .filter((id) => id !== pitcher)
              .sort(
                (a, b) => Number(!!players.get(b)?.canPitch) - Number(!!players.get(a)?.canPitch),
              ),
            first,
            (id) => {
              setFirst(id);
              setOldPitcherTo(null);
            },
            (id) => `${positionLabel(spotAt(id))}${players.get(id)?.canPitch ? " · pitches" : ""}`,
          )}
          {first && pitcher && (
            <>
              <h3 className="mt-2 text-base font-bold">Where does {name(pitcher)} go?</h3>
              <div className="flex flex-wrap gap-2">
                {[...positions.filter((p) => p !== "P"), "BENCH" as const].map((pos) => {
                  const chosen = (oldPitcherTo ?? spotAt(first)) === pos;
                  return (
                    <button
                      key={pos}
                      onClick={() => setOldPitcherTo(pos)}
                      aria-pressed={chosen}
                      className={`flex h-12 min-w-14 items-center justify-center rounded-lg px-2 text-base font-black ${chosen ? "ring-4 ring-[var(--team)]" : ""} ${positionClass(pos)}`}
                    >
                      {positionLabel(pos)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {at !== null && kind === "swap" && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-bold">Which two players swap?</h3>
          {chooser(onField, first, (id) => {
            if (first && first !== id) setSecond(id);
            else setFirst(id);
          })}
          {first && !second && (
            <p className="text-sm text-slate-600">Now tap who {name(first)} swaps with.</p>
          )}
        </section>
      )}

      {at !== null && kind === "sub" && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-bold">Who comes in from the bench?</h3>
          {onBench.length ? (
            chooser(onBench, first, setFirst, () => "Bench")
          ) : (
            <p className="text-base text-slate-600">Nobody is on the bench then.</p>
          )}
          {first && (
            <>
              <h3 className="mt-2 text-base font-bold">Who comes out?</h3>
              {chooser(onField, second, setSecond)}
            </>
          )}
        </section>
      )}

      {moves.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border-2 border-[var(--team)] bg-white p-3">
          <p className="text-base font-bold">
            {at !== null && `${whenText(at)[0]!.toUpperCase()}${whenText(at).slice(1)}:`}
          </p>
          <ul className="flex flex-col gap-1 text-base">
            {moves.map((m) => (
              <li key={m.playerId}>{moveText(m)}</li>
            ))}
          </ul>
          <button
            onClick={save}
            className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
          >
            Save the change
          </button>
        </section>
      )}
    </div>
  );
}
