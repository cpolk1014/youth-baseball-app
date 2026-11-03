"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  /** e.g. Undo. */
  action?: { label: string; run: () => void };
}

let current: ToastMessage | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** A short note at the bottom of the screen ("Swapped Mason and Leo · Undo"). */
export function toast(text: string, action?: ToastMessage["action"]) {
  current = { id: nextId++, text, action };
  emit();
}

const dismiss = (id: number) => {
  if (current?.id === id) {
    current = null;
    emit();
  }
};

const SHOW_MS = 6000;

export function ToastHost() {
  const msg = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!msg || paused) return;
    const t = window.setTimeout(() => dismiss(msg.id), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [msg, paused]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] print:hidden"
    >
      {msg && (
        <div
          key={msg.id}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 py-2 pr-2 pl-4 text-base text-white shadow-2xl"
        >
          <span className="min-w-0 flex-1">{msg.text}</span>
          {msg.action && (
            <button
              onClick={() => {
                msg.action!.run();
                dismiss(msg.id);
              }}
              className="h-10 shrink-0 rounded-lg px-3 font-bold text-sky-300 hover:bg-white/10"
            >
              {msg.action.label}
            </button>
          )}
          <button
            onClick={() => dismiss(msg.id)}
            aria-label="Dismiss"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-xl text-white/60 hover:bg-white/10"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
