"use client";

import { useState } from "react";
import { isCoach } from "@/lib/data/permissions";
import { deleteUniform, newId, saveUniform, useAppData } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import { cleanPieces, type UniformCombo } from "@/lib/uniforms";
import { AppShell, Loading } from "../AppShell";
import { Sheet } from "../Sheet";
import { FlyerImport } from "./FlyerImport";
import { UniformForm } from "./UniformForm";
import { UniformSwatches } from "./UniformSwatches";

/** Coaches and managers keep the team's uniform combos; games pick one. */
export function UniformsScreen() {
  const data = useAppData();
  if (!data) {
    return (
      <AppShell title="Uniforms" tab="roster">
        <Loading />
      </AppShell>
    );
  }
  const staff = isCoach(data.me.role) || data.me.role === "manager";
  if (!staff) {
    return (
      <AppShell title="Uniforms" subtitle={data.team.name} tab="roster">
        <p className="text-lg">Uniforms are set up by coaches and managers.</p>
      </AppShell>
    );
  }
  return <Uniforms data={data} />;
}

function Uniforms({ data }: { data: AppData }) {
  const [editing, setEditing] = useState<UniformCombo | null>(null);
  const [reading, setReading] = useState(false);
  const canEdit = data.team.optionedAt === null;
  const own = data.uniforms.filter((u) => !u.clubId);
  const fromClub = data.uniforms.filter((u) => u.clubId);
  const isNew = editing !== null && !own.some((u) => u.id === editing.id);
  const add = () => setEditing({ id: newId(), name: "", ...cleanPieces({}) });
  const used = (id: string) =>
    data.games.filter((g) => g.uniform && "comboId" in g.uniform && g.uniform.comboId === id)
      .length;

  return (
    <AppShell
      title="Uniforms"
      subtitle={data.team.name}
      backHref="/roster"
      tab="roster"
      action={
        canEdit && (
          <button
            onClick={add}
            className="h-11 shrink-0 rounded-lg bg-white px-4 text-base font-bold text-[var(--team)] active:bg-slate-200"
          >
            + Add
          </button>
        )
      }
    >
      <p className="mb-4 text-base text-slate-700">
        Save the team&apos;s uniform combos here, then pick one for each game. Families see what to
        wear on the game.
      </p>

      {canEdit && (
        <button
          onClick={() => setReading(true)}
          className="mb-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-[var(--team)] bg-white text-lg font-bold text-[var(--team)] active:bg-slate-100"
        >
          <span aria-hidden="true">📷</span> Build combos from a flyer
        </button>
      )}

      {fromClub.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
            From {data.team.club?.name ?? "your club"}
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {fromClub.map((u) => (
              <li
                key={u.id}
                className="flex flex-col gap-2 rounded-xl border-2 border-slate-200 bg-white p-3"
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-lg font-bold">{u.name}</span>
                  {used(u.id) > 0 && (
                    <span className="text-sm text-slate-600">
                      {used(u.id)} game{used(u.id) === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                <UniformSwatches pieces={u} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-slate-600">The club keeps these up to date.</p>
        </section>
      )}

      {own.length > 0 && fromClub.length > 0 && (
        <h2 className="mb-2 text-sm font-bold tracking-wide text-slate-600 uppercase">
          Your team&apos;s combos
        </h2>
      )}
      {own.length === 0 && fromClub.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 text-base">
          No combos yet. Add one, or take a picture of the uniform flyer and RallyCap builds them
          for you.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {own.map((u) => (
            <li key={u.id}>
              <button
                onClick={canEdit ? () => setEditing(u) : undefined}
                disabled={!canEdit}
                className="flex h-full w-full flex-col gap-2 rounded-xl border-2 border-slate-200 bg-white p-3 text-left active:bg-slate-50"
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-lg font-bold">{u.name}</span>
                  {used(u.id) > 0 && (
                    <span className="text-sm text-slate-600">
                      {used(u.id)} game{used(u.id) === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                <UniformSwatches pieces={u} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {canEdit && own.length > 0 && (
        <button
          onClick={add}
          className="mt-4 h-14 w-full rounded-xl border-2 border-dashed border-slate-400 text-lg font-bold text-slate-700 active:bg-slate-100"
        >
          + Add combo
        </button>
      )}

      <Sheet
        open={editing !== null}
        title={isNew ? "New combo" : "Edit combo"}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <UniformForm
            key={editing.id}
            name={editing.name}
            pieces={editing}
            saveLabel="Save combo"
            onCancel={() => setEditing(null)}
            onSave={(name, pieces) => {
              saveUniform({ id: editing.id, name, ...pieces });
              setEditing(null);
            }}
            onDelete={
              isNew
                ? undefined
                : () => {
                    deleteUniform(editing.id);
                    setEditing(null);
                  }
            }
          />
        )}
      </Sheet>

      <Sheet open={reading} title="Build combos from a flyer" onClose={() => setReading(false)}>
        {reading && <FlyerImport teamId={data.team.id} onDone={() => setReading(false)} />}
      </Sheet>
    </AppShell>
  );
}
