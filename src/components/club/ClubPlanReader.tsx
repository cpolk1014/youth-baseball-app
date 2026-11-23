"use client";

import { useState } from "react";
import type { ClubPlan } from "@/lib/data/club-backend";
import { newId } from "@/lib/data/store";
import { MAX_PLAN_FILES, type ReadPlan } from "@/lib/practice/planRead";
import { picturesFrom } from "../chatter/photo";
import { shrinkImage } from "../receiptFile";
import { ClubPlanEditor } from "./ClubPlanEditor";

/** Everything sent in one read stays under the server's 4 MB. */
const MAX_TOTAL = 3.9 * 1024 * 1024;
const PICTURE_MAX_SIDE = 2000;
const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/**
 * Pictures are shrunk on the phone. PDFs go as they are (Claude reads their text best), unless
 * they'd be too big together: then their pages are drawn as pictures here first.
 */
async function prepare(files: File[]): Promise<Blob[]> {
  const pictures = await Promise.all(
    files.filter((f) => !isPdf(f)).map((f) => shrinkImage(f, PICTURE_MAX_SIDE)),
  );
  const pdfs = files.filter(isPdf);
  const size = (bs: Blob[]) => bs.reduce((n, b) => n + b.size, 0);
  if (size(pictures) + size(pdfs) <= MAX_TOTAL) return [...pdfs, ...pictures];
  const room = MAX_PLAN_FILES - pictures.length;
  const { pictures: pages, leftOut } = await picturesFrom(pdfs, room);
  if (leftOut > 0) {
    throw new Error(
      `That's too many pages to read at once. Pick up to ${MAX_PLAN_FILES} pages or pictures.`,
    );
  }
  const all = [
    ...(await Promise.all(pages.map((p) => shrinkImage(p, PICTURE_MAX_SIDE)))),
    ...pictures,
  ];
  if (size(all) > MAX_TOTAL) throw new Error("Those files are too big together. Try fewer.");
  return all;
}

type Draft = ClubPlan & { keep: boolean };

/** PDF or screenshots of practice plans → plans to check and fix → saved to the Library. */
export function ClubPlanReader({
  clubId,
  onSave,
  onDone,
}: {
  clubId: string;
  onSave: (plans: ClubPlan[]) => Promise<void>;
  onDone: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Draft[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fixing, setFixing] = useState<number | null>(null);

  const add = (picked: File[]) => {
    setError(null);
    const all = [...files, ...picked];
    if (all.length > MAX_PLAN_FILES) setError(`Up to ${MAX_PLAN_FILES} files at a time.`);
    setFiles(all.slice(0, MAX_PLAN_FILES));
  };

  const read = async () => {
    setError(null);
    setBusy(files.length === 1 ? "Reading the plans…" : `Reading ${files.length} files…`);
    try {
      const body = new FormData();
      body.set("clubId", clubId);
      for (const [i, b] of (await prepare(files)).entries()) {
        const name = b instanceof File ? b.name : `page-${i + 1}.jpg`;
        body.append("file", b, name);
      }
      const res = await fetch("/api/club/plans/read", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        plans?: ReadPlan[];
        warnings?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Couldn't read the plans. Try again.");
      const plans = json.plans ?? [];
      if (plans.length === 0) throw new Error(json.warnings?.[0] ?? "No practice plans found.");
      setFound(plans.map((p) => ({ ...p, id: newId(), keep: true })));
      setWarnings(json.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("Saving…");
    setError(null);
    try {
      await onSave(
        (found ?? [])
          .filter((p) => p.keep)
          .map((p) => ({ id: p.id, title: p.title, focus: p.focus, items: p.items })),
      );
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  if (found && fixing !== null) {
    const draft = found[fixing]!;
    return (
      <ClubPlanEditor
        plan={draft}
        saveLabel="Done"
        onCancel={() => setFixing(null)}
        onSave={(p) => {
          setFound(found.map((x, i) => (i === fixing ? { ...p, keep: true } : x)));
          setFixing(null);
        }}
      />
    );
  }

  const keeping = found?.filter((p) => p.keep).length ?? 0;
  const minutes = (p: ClubPlan) => p.items.reduce((s, i) => s + i.minutes, 0);
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}

      {!found && busy && (
        <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
          <div className="size-10 animate-spin rounded-full border-4 border-slate-300 border-t-[var(--team)]" />
          <p className="text-lg font-semibold">{busy}</p>
          <p className="text-base text-slate-600">This can take up to a minute.</p>
        </div>
      )}

      {!found && !busy && (
        <>
          <p className="text-base text-slate-700">
            Pick a PDF, photo or screenshot of your practice plans or drill sheets (up to{" "}
            {MAX_PLAN_FILES} at once). Fungo reads each plan and its drills, with how to run them,
            and you check and fix them before they&apos;re saved.
          </p>
          {files.length > 0 && (
            <ul className="flex flex-col gap-2">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white p-2 pl-3"
                >
                  <span aria-hidden>{isPdf(f) ? "📄" : "🖼️"}</span>
                  <span className="min-w-0 flex-1 truncate text-base">{f.name}</span>
                  <button
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    aria-label={`Remove ${f.name}`}
                    className="size-11 shrink-0 rounded-lg text-xl text-slate-500 active:bg-slate-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {files.length < MAX_PLAN_FILES && (
            <label
              className={`flex h-14 cursor-pointer items-center justify-center rounded-xl text-lg font-bold ${files.length ? "border-2 border-slate-400 bg-white" : "bg-[var(--team)] text-white"}`}
            >
              {files.length ? "+ Add another file" : "Choose a PDF or picture"}
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="sr-only"
                onChange={(e) => {
                  add([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {files.length > 0 && (
            <button
              onClick={() => void read()}
              className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
            >
              ✨ Read {files.length === 1 ? "it" : `${files.length} files`}
            </button>
          )}
        </>
      )}

      {found && (
        <>
          <p className="text-base font-semibold">
            Found {found.length} plan{found.length === 1 ? "" : "s"}. Tap one to check and fix its
            drills.
          </p>
          {warnings.length > 0 && (
            <ul className="rounded-xl bg-amber-50 p-3 text-base text-amber-950">
              {warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
          <ul className="flex flex-col gap-2">
            {found.map((p, i) => (
              <li
                key={p.id}
                className="flex items-start gap-3 rounded-xl border-2 border-slate-200 bg-white p-3"
              >
                <input
                  type="checkbox"
                  checked={p.keep}
                  aria-label={`Save ${p.title}`}
                  onChange={() =>
                    setFound(found.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))
                  }
                  className="mt-1 size-6 shrink-0 accent-[var(--team)]"
                />
                <button
                  onClick={() => setFixing(i)}
                  className="min-w-0 flex-1 text-left active:bg-slate-50"
                >
                  <span className="block text-lg font-bold">{p.title}</span>
                  <span className="block text-sm text-slate-600">
                    {p.focus ? `${p.focus} · ` : ""}
                    {p.items.length} drill{p.items.length === 1 ? "" : "s"} · {minutes(p)} min
                  </span>
                  <span className="block text-sm text-slate-600">
                    {p.items.map((d) => d.title).join(" · ")}
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-[var(--team)]">
                    Check and fix →
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setFound(null);
                setWarnings([]);
              }}
              disabled={busy !== null}
              className="h-14 flex-1 rounded-xl border-2 border-slate-400 text-lg font-bold active:bg-slate-100"
            >
              Start over
            </button>
            <button
              onClick={() => void save()}
              disabled={keeping === 0 || busy !== null}
              className="h-14 flex-[2] rounded-xl bg-[var(--team)] text-lg font-bold text-white disabled:opacity-40"
            >
              {busy ?? `Save ${keeping} plan${keeping === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
