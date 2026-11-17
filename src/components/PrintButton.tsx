"use client";

import { useState } from "react";
import { pdfFileName, sharePdf, wantsPdf } from "@/lib/print/phone";

/**
 * Print: the print dialog on a computer. On a phone or tablet (where a home-screen app can't
 * print) it makes a PDF, then a second tap opens the share sheet: Print, Save to Files and
 * the rest. (The share sheet has to open straight from a tap.)
 */
export function PrintButton({
  makePdf,
  name,
  disabled = false,
  className = "",
}: {
  /** Builds the PDF (loaded only when needed). */
  makePdf: () => Promise<Blob>;
  /** The PDF's file name, without ".pdf". */
  name: string;
  disabled?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "making" }
    | { kind: "ready"; file: File }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const base = `h-12 rounded-xl px-6 text-lg font-bold text-white disabled:opacity-40 ${className}`;

  if (state.kind === "ready") {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={() =>
            void sharePdf(state.file).then((r) => {
              if (r !== "canceled") setState({ kind: "idle" });
            })
          }
          className={`${base} bg-[var(--team)] active:bg-[var(--team-press)]`}
        >
          Open PDF to print or save
        </button>
        <p className="text-sm text-slate-600">
          Choose <b>Print</b> in the share sheet, or save it to Files.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        disabled={disabled || state.kind === "making"}
        onClick={async () => {
          if (!wantsPdf()) {
            window.print();
            return;
          }
          setState({ kind: "making" });
          try {
            const blob = await makePdf();
            setState({
              kind: "ready",
              file: new File([blob], pdfFileName(name), { type: "application/pdf" }),
            });
          } catch (e) {
            setState({
              kind: "error",
              message: e instanceof Error ? e.message : String(e),
            });
          }
        }}
        className={`${base} bg-green-700 active:bg-green-800`}
      >
        {state.kind === "making" ? "Making the PDF…" : "Print"}
      </button>
      {state.kind === "error" && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          Couldn&apos;t make the PDF ({state.message}). Try again.
        </p>
      )}
    </div>
  );
}
