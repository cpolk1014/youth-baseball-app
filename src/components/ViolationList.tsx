"use client";

import type { Violation } from "@/lib/rules/types";

export function ViolationList({
  violations,
  emptyCells,
}: {
  violations: Violation[];
  emptyCells: number;
}) {
  const blocks = violations.filter((v) => v.severity === "block");
  const warns = violations.filter((v) => v.severity === "warn");

  if (blocks.length === 0 && warns.length === 0 && emptyCells === 0) {
    return (
      <p className="rounded-xl bg-green-700 p-4 text-lg font-bold text-white" role="status">
        ✓ Lineup is complete and follows every fair-play rule.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" role="status">
      {emptyCells > 0 && (
        <p className="rounded-xl border-2 border-slate-400 bg-white p-3 text-base font-semibold">
          {emptyCells} empty {emptyCells === 1 ? "spot" : "spots"} to fill
        </p>
      )}
      {blocks.length > 0 && (
        <section className="rounded-xl border-2 border-red-700 bg-red-50 p-3">
          <h3 className="mb-1 text-base font-bold text-red-800">Must fix ({blocks.length})</h3>
          <ul className="list-disc pl-5 text-base leading-snug text-red-950">
            {blocks.map((v, i) => (
              <li key={i}>{v.message}</li>
            ))}
          </ul>
        </section>
      )}
      {warns.length > 0 && (
        <section className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3">
          <h3 className="mb-1 text-base font-bold text-amber-900">Warnings ({warns.length})</h3>
          <ul className="list-disc pl-5 text-base leading-snug text-amber-950">
            {warns.map((v, i) => (
              <li key={i}>{v.message}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
