"use client";

// "Save me from myself": a person's own setting (profile.confirm_posts, so it follows them to
// every phone) that asks before each post goes out and says who's about to read it.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  SAVE_ME_PITCH,
  SAVE_ME_TITLE,
  audienceLine,
  saveMeLines,
  type Audience,
} from "@/lib/chatter/saveMe";
import { Sheet } from "../Sheet";
import { toast } from "../shell/Toast";

const KEY = (userId: string) => `rallycap:save-me:${userId}`;
const backend = () => import("@/lib/data/account-backend");

// One copy for the whole app, so the Chatter switch and My profile's agree.
const state = new Map<string, boolean>();
const listeners = new Set<() => void>();
const loading = new Set<string>();

function setLocal(userId: string, on: boolean) {
  state.set(userId, on);
  try {
    window.localStorage.setItem(KEY(userId), on ? "1" : "0");
  } catch {
    // Storage blocked: the setting still comes from the profile.
  }
  for (const l of listeners) l();
}

function read(userId: string): boolean {
  if (state.has(userId)) return state.get(userId)!;
  try {
    return window.localStorage.getItem(KEY(userId)) === "1";
  } catch {
    return false;
  }
}

/** Whether Save me from myself is on for this person, and a way to change it. */
export function useSaveMe(userId: string | null | undefined) {
  const on = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (userId ? read(userId) : false),
    () => false,
  );
  useEffect(() => {
    if (!userId || state.has(userId) || loading.has(userId)) return;
    loading.add(userId);
    void backend()
      .then((m) => m.mySaveMe(userId))
      .then((v) => setLocal(userId, v))
      .catch(() => undefined)
      .finally(() => loading.delete(userId));
  }, [userId]);
  const set = useCallback(
    async (next: boolean) => {
      if (!userId) return;
      const before = read(userId);
      setLocal(userId, next);
      try {
        await (await backend()).saveMySaveMe(userId, next);
      } catch {
        setLocal(userId, before);
        throw new Error("Couldn't save that. Try again.");
      }
    },
    [userId],
  );
  return { on, set };
}

/** The setting as a switch, for Chatter's settings and My profile. */
export function SaveMeSwitch({ userId }: { userId: string }) {
  const { on, set } = useSaveMe(userId);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-12 items-center justify-between gap-3">
        <span className="text-lg font-black">{SAVE_ME_TITLE}</span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          onChange={async (e) => {
            const next = e.target.checked;
            try {
              await set(next);
              toast(
                next
                  ? "Saved from yourself. Every post asks first."
                  : "You're on your own now. Godspeed.",
              );
            } catch (err) {
              toast(err instanceof Error ? err.message : "Couldn't save that.");
            }
          }}
          className="size-6 shrink-0 accent-[var(--team)]"
        />
      </label>
      <p className="text-base text-slate-700">{SAVE_ME_PITCH}</p>
      <p className="text-sm text-slate-500">
        Just for you, on every team and every phone you sign in on. Nobody else can tell it&apos;s
        on.
      </p>
    </div>
  );
}

export interface PostCheck {
  where: Audience;
  /** The team's (or club's) name, for who reads it. */
  name: string;
  body: string;
  photos?: number;
  gif?: boolean;
  poll?: boolean;
  edit?: boolean;
}

/**
 * `confirm(check)` resolves true to send. With the setting off it says yes at once; with it on
 * it shows the check (render `sheet` somewhere on the screen).
 */
export function usePostCheck(userId: string | null | undefined) {
  const { on } = useSaveMe(userId);
  const [pending, setPending] = useState<PostCheck | null>(null);
  const answer = useRef<((ok: boolean) => void) | null>(null);
  const confirm = useCallback(
    (check: PostCheck): Promise<boolean> => {
      if (!on) return Promise.resolve(true);
      answer.current?.(false);
      return new Promise<boolean>((resolve) => {
        answer.current = resolve;
        setPending(check);
      });
    },
    [on],
  );
  const finish = (ok: boolean) => {
    answer.current?.(ok);
    answer.current = null;
    setPending(null);
  };
  const sheet = (
    <Sheet
      open={pending !== null}
      title={pending ? saveMeLines(pending.body).headline : ""}
      onClose={() => finish(false)}
    >
      {pending && <CheckBody check={pending} onAnswer={finish} />}
    </Sheet>
  );
  return { confirm, sheet };
}

function CheckBody({ check, onAnswer }: { check: PostCheck; onAnswer: (ok: boolean) => void }) {
  const { nudge } = saveMeLines(check.body);
  const who = audienceLine(check.where, check.name);
  const extras = [
    check.photos ? (check.photos === 1 ? "📷 1 photo" : `📷 ${check.photos} photos`) : "",
    check.gif ? "🎞️ a GIF" : "",
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">{nudge}</p>
      <div className="rounded-xl border-2 border-[var(--team)] bg-white p-3">
        <p className="text-sm font-bold tracking-wide text-[var(--team)] uppercase">
          {check.edit ? "Saving your edit to" : check.poll ? "Asking in" : "Posting to"} the{" "}
          {who.label}
        </p>
        <p className="mt-1 text-base font-semibold">{who.who}</p>
      </div>
      {(check.body || extras.length > 0) && (
        <blockquote className="max-h-48 overflow-y-auto rounded-xl bg-slate-100 p-3 text-lg whitespace-pre-wrap">
          {check.poll && <span aria-hidden="true">📊 </span>}
          {check.body}
          {extras.length > 0 && (
            <span className="mt-1 block text-base text-slate-600">{extras.join(" · ")}</span>
          )}
        </blockquote>
      )}
      <button
        autoFocus
        onClick={() => onAnswer(true)}
        className="flex h-14 w-full items-center justify-center rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)]"
      >
        {check.edit ? "Yep, save it ⚾" : "Send it ⚾"}
      </button>
      <button
        onClick={() => onAnswer(false)}
        className="flex h-12 w-full items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-base font-bold active:bg-slate-100"
      >
        On second thought… back to the dugout
      </button>
      <p className="text-center text-sm text-slate-500">
        Save me from myself is on. Your words stay in the box if you back out.
      </p>
    </div>
  );
}
