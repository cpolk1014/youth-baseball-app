"use client";

import Link from "next/link";
import { useState } from "react";
import { setGameUniform } from "@/lib/data/store";
import type { Game } from "@/lib/data/types";
import { cleanPieces, gameUniformShown, type UniformCombo } from "@/lib/uniforms";
import { Sheet } from "../Sheet";
import { UniformForm } from "./UniformForm";
import { UniformSwatches } from "./UniformSwatches";

/** What the team wears to this game; coaches and managers pick a combo or make one. */
export function GameUniformCard({
  game,
  combos,
  canEdit,
}: {
  game: Game;
  combos: UniformCombo[];
  canEdit: boolean;
}) {
  const [picking, setPicking] = useState<"list" | "custom" | null>(null);
  const shown = gameUniformShown(game.uniform, combos);
  if (!shown && !canEdit) return null;

  const current = game.uniform && "comboId" in game.uniform ? game.uniform.comboId : null;
  const pick = (comboId: string | null) => {
    setGameUniform(game.id, comboId ? { comboId } : null);
    setPicking(null);
  };

  return (
    <section className="mb-4 rounded-xl border-2 border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-wide text-slate-600 uppercase">Uniform</h2>
          {shown ? (
            <>
              <p className="text-lg font-bold">{shown.name ?? "Just for this game"}</p>
              <UniformSwatches pieces={shown.pieces} />
            </>
          ) : (
            <p className="text-base text-slate-700">Not set yet.</p>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => setPicking("list")}
            className="h-11 shrink-0 rounded-lg border-2 border-slate-400 px-4 text-base font-bold active:bg-slate-100"
          >
            {shown ? "Change" : "Set"}
          </button>
        )}
      </div>

      <Sheet
        open={picking !== null}
        title={picking === "custom" ? "Uniform for this game" : "Uniform"}
        onClose={() => setPicking(null)}
      >
        {picking === "custom" ? (
          <UniformForm
            name={null}
            pieces={shown?.pieces ?? cleanPieces({})}
            saveLabel="Use for this game"
            onCancel={() => setPicking("list")}
            onSave={(_name, pieces) => {
              setGameUniform(game.id, { custom: pieces });
              setPicking(null);
            }}
          />
        ) : (
          picking === "list" && (
            <div className="flex flex-col gap-2">
              {combos.length === 0 && (
                <p className="text-base text-slate-700">
                  No combos saved yet.{" "}
                  <Link href="/uniforms" className="font-semibold underline">
                    Set them up
                  </Link>{" "}
                  (or build them from the flyer), or make one just for this game.
                </p>
              )}
              <div role="radiogroup" aria-label="Uniform" className="flex flex-col gap-2">
                {combos.map((c) => (
                  <button
                    key={c.id}
                    role="radio"
                    aria-checked={current === c.id}
                    onClick={() => pick(c.id)}
                    className={`flex flex-col gap-1 rounded-xl border-2 p-3 text-left ${
                      current === c.id
                        ? "border-[var(--team)] bg-slate-50 ring-2 ring-[var(--team)]"
                        : "border-slate-300 bg-white active:bg-slate-50"
                    }`}
                  >
                    <span className="text-lg font-bold">{c.name}</span>
                    <UniformSwatches pieces={c} />
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPicking("custom")}
                className={`h-14 rounded-xl border-2 text-lg font-bold ${
                  game.uniform && "custom" in game.uniform
                    ? "border-[var(--team)] text-[var(--team)] ring-2 ring-[var(--team)]"
                    : "border-dashed border-slate-400 text-slate-800 active:bg-slate-100"
                }`}
              >
                {game.uniform && "custom" in game.uniform
                  ? "Edit this game's own uniform"
                  : "Make one just for this game"}
              </button>
              {shown && (
                <button
                  onClick={() => pick(null)}
                  className="h-12 text-base font-semibold text-slate-700 underline"
                >
                  No uniform set
                </button>
              )}
            </div>
          )
        )}
      </Sheet>
    </section>
  );
}
