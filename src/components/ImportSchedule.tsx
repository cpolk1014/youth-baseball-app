"use client";

import { useState } from "react";
import { defaultFieldPlayers } from "@/lib/data/game";
import { addPractices, newId, saveGame } from "@/lib/data/store";
import type { AppData } from "@/lib/data/types";
import { formatPracticeWhen } from "@/lib/practice/format";
import {
  buildImportReview,
  toGame,
  toPractice,
  type ImportReview,
  type ReviewGame,
} from "@/lib/schedule-import/review";
import type { ScheduleExtraction } from "@/lib/schedule-import/schema";

type Step =
  | { kind: "pick" }
  | { kind: "reading"; fileName: string }
  | { kind: "review"; review: ImportReview }
  | { kind: "done"; practices: number; games: number };

const MAX_IMAGE_EDGE = 2000;

/** Shrink big phone photos so the upload stays small; other files pass through. */
async function prepareFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    return blob
      ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" })
      : file;
  } catch {
    return file; // Couldn't decode here (e.g. an unusual format): let the server try.
  }
}

function gameWhen(g: ReviewGame): string {
  return formatPracticeWhen({ date: g.date, startTime: g.startTime, endTime: null });
}

/** Upload a schedule (photo, PDF or CSV), review what was found, add the checked items. */
export function ImportSchedule({ data, onClose }: { data: AppData; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);

  const read = async (file: File) => {
    setError(null);
    setStep({ kind: "reading", fileName: file.name });
    try {
      const body = new FormData();
      body.append("file", await prepareFile(file));
      body.append("teamId", data.team.id);
      const res = await fetch("/api/schedule-import", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as ScheduleExtraction & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't read that file. Try again.");
      setStep({ kind: "review", review: buildImportReview(json, data.practices, data.games) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep({ kind: "pick" });
    }
  };

  if (step.kind === "reading") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <div className="size-10 animate-spin rounded-full border-4 border-slate-300 border-t-[#0b1f3a]" />
        <p className="text-lg font-semibold">Reading {step.fileName}…</p>
        <p className="text-base text-slate-600">This can take up to a minute.</p>
      </div>
    );
  }

  if (step.kind === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl bg-green-700 p-4 text-lg font-bold text-white" role="status">
          Added {step.practices} practice{step.practices === 1 ? "" : "s"} and {step.games} game
          {step.games === 1 ? "" : "s"}.
        </p>
        <p className="text-base text-slate-700">
          Games are on the Games tab; open any of them to edit details.
        </p>
        <button
          onClick={onClose}
          className="h-14 rounded-xl bg-[#0b1f3a] text-lg font-bold text-white"
        >
          Done
        </button>
      </div>
    );
  }

  if (step.kind === "review") {
    return (
      <ReviewList
        data={data}
        review={step.review}
        onAdded={(p, g) => setStep({ kind: "done", practices: p, games: g })}
        onBack={() => setStep({ kind: "pick" })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-slate-700">
        Upload your season schedule: a photo or screenshot of a flyer, a PDF, or a CSV. We&apos;ll
        find the practices and games and show them to you before anything is added.
      </p>
      <label className="flex h-16 cursor-pointer items-center justify-center rounded-xl bg-[#0b1f3a] text-lg font-bold text-white active:bg-[#16325a]">
        Choose a file
        <input
          type="file"
          accept="image/*,application/pdf,.pdf,.csv,text/csv,.txt"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void read(file);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-900">
          {error}
        </p>
      )}
      <p className="text-sm text-slate-600">
        Your file is sent to Claude (Anthropic&apos;s AI) to read the dates. Nothing is added until
        you confirm.
      </p>
    </div>
  );
}

function ReviewList({
  data,
  review,
  onAdded,
  onBack,
}: {
  data: AppData;
  review: ImportReview;
  onAdded: (practices: number, games: number) => void;
  onBack: () => void;
}) {
  const [practices, setPractices] = useState(review.practices);
  const [games, setGames] = useState(review.games);
  const pickedPractices = practices.filter((p) => p.selected);
  const pickedGames = games.filter((g) => g.selected);
  const total = pickedPractices.length + pickedGames.length;

  const add = () => {
    addPractices(pickedPractices.map((p) => toPractice(p, data.season.id, newId())));
    const fieldPlayers = defaultFieldPlayers(data.team.coachPitch);
    for (const g of pickedGames)
      saveGame(toGame(g, { seasonId: data.season.id, id: newId(), fieldPlayers }));
    onAdded(pickedPractices.length, pickedGames.length);
  };

  if (practices.length === 0 && games.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-base">
          No practices or games were found in that file.
          {review.warnings.length > 0 && ` ${review.warnings.join(" ")}`}
        </p>
        <button
          onClick={onBack}
          className="h-14 rounded-xl border-2 border-slate-400 text-lg font-bold"
        >
          Try another file
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {(review.warnings.length > 0 || review.skipped > 0) && (
        <section className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-amber-950">
          <h3 className="mb-1 text-base font-bold">Please check</h3>
          <ul className="list-disc pl-5 text-base leading-snug">
            {review.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {review.skipped > 0 && (
              <li>
                {review.skipped} entries had dates that couldn&apos;t be read and were left out.
              </li>
            )}
          </ul>
        </section>
      )}

      {practices.length > 0 && (
        <ReviewSection
          title={`Practices (${pickedPractices.length} of ${practices.length})`}
          allOn={pickedPractices.length === practices.length}
          onAll={(on) => setPractices((ps) => ps.map((p) => ({ ...p, selected: on })))}
        >
          {practices.map((p) => (
            <Row
              key={p.key}
              checked={p.selected}
              onToggle={() =>
                setPractices((ps) =>
                  ps.map((x) => (x.key === p.key ? { ...x, selected: !x.selected } : x)),
                )
              }
              title={formatPracticeWhen(p)}
              detail={[p.location, p.note].filter(Boolean).join(" · ")}
              tag={p.duplicate ? "Already scheduled" : null}
            />
          ))}
        </ReviewSection>
      )}

      {games.length > 0 && (
        <ReviewSection
          title={`Games (${pickedGames.length} of ${games.length})`}
          allOn={pickedGames.length === games.length}
          onAll={(on) => setGames((gs) => gs.map((g) => ({ ...g, selected: on })))}
        >
          {games.map((g) => (
            <Row
              key={g.key}
              checked={g.selected}
              onToggle={() =>
                setGames((gs) =>
                  gs.map((x) => (x.key === g.key ? { ...x, selected: !x.selected } : x)),
                )
              }
              title={`${gameWhen(g)} · vs ${g.opponent ?? "TBD"}`}
              detail={[g.location, g.note].filter(Boolean).join(" · ")}
              tag={g.duplicate ? "Game already that day" : g.tentative ? "Tentative" : null}
            />
          ))}
        </ReviewSection>
      )}

      <div className="sticky bottom-0 -mx-4 flex gap-3 bg-white px-4 pt-2 pb-1">
        <button
          onClick={onBack}
          className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
        >
          Back
        </button>
        <button
          onClick={add}
          disabled={total === 0}
          className="h-14 flex-[2] rounded-xl bg-green-700 text-lg font-bold text-white disabled:opacity-40 active:bg-green-800"
        >
          Add {total} item{total === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  allOn,
  onAll,
  children,
}: {
  title: string;
  allOn: boolean;
  onAll: (on: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-wide text-slate-600 uppercase">{title}</h3>
        <button onClick={() => onAll(!allOn)} className="h-10 px-2 text-sm font-semibold underline">
          {allOn ? "Uncheck all" : "Check all"}
        </button>
      </div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function Row({
  checked,
  onToggle,
  title,
  detail,
  tag,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  detail: string;
  tag: string | null;
}) {
  return (
    <li>
      <label
        className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 bg-white p-3 ${checked ? "border-[#0b1f3a]" : "border-slate-200"}`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 size-6 shrink-0 accent-[#0b1f3a]"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">{title}</span>
          {detail && <span className="block text-sm text-slate-600">{detail}</span>}
        </span>
        {tag && (
          <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-950">
            {tag}
          </span>
        )}
      </label>
    </li>
  );
}
