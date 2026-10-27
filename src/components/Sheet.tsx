"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";

/** Bottom sheet dialog: easy to reach one-handed. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(() => onClose());

  // Runs only when the sheet opens. Callers pass a new onClose on every render, so
  // depending on it would re-focus the panel on each keystroke in a field inside the
  // sheet, closing the phone's keyboard.
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    // Phones: a sheet from the bottom. Tablets and up: a centered dialog.
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center md:p-6">
      <button aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl outline-none md:max-h-[85dvh] md:max-w-lg md:rounded-2xl md:px-6 md:pt-5 md:pb-6"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300 md:hidden" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="h-11 rounded-lg px-3 text-base font-semibold text-slate-700 active:bg-slate-100"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
