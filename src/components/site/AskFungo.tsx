"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ASK_ERROR_TEXT,
  ASK_MAX_QUESTION,
  ASK_MAX_QUESTIONS,
  ASK_STARTERS,
  answerBlocks,
  type AnswerPiece,
  type AskTurn,
} from "@/lib/ask/chat";

/**
 * Ask Fungo: the website's help chat. A button in the corner of every site page opens a chat
 * that answers questions about Fungo (from AI, with a daily limit), and points to the trial,
 * the demo or a club.
 */
export function AskFungo() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const questions = turns.filter((t) => t.role === "user").length;
  const full = questions >= ASK_MAX_QUESTIONS;

  // Follow the answer as it streams in.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const ask = async (question: string) => {
    const q = question.trim().slice(0, ASK_MAX_QUESTION);
    if (!q || busy || full) return;
    const chat: AskTurn[] = [...turns, { role: "user", text: q }];
    setTurns([...chat, { role: "assistant", text: "" }]);
    setDraft("");
    setBusy(true);
    const answer = (text: string) =>
      setTurns((prev) => [...prev.slice(0, -1), { role: "assistant", text }]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat, page: pathname }),
      });
      if (!res.body || (res.headers.get("content-type") ?? "").includes("application/json")) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        answer(data?.error ?? ASK_ERROR_TEXT);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        answer(text);
      }
      answer(text.trim() || ASK_ERROR_TEXT);
    } catch {
      answer(ASK_ERROR_TEXT);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex h-14 items-center gap-2 rounded-full bg-[#DC143C] px-5 text-base font-bold text-white shadow-lg shadow-[#DC143C]/30 hover:bg-[#B5102F] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#1B2A4A] print:hidden"
      >
        <span aria-hidden="true" className="text-xl">
          💬
        </span>
        Ask Fungo
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Ask Fungo"
      className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:right-4 sm:bottom-4 sm:h-[min(640px,calc(100dvh-2rem))] sm:w-[400px] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl print:hidden"
    >
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG */}
        <img src="/brand/fungo-icon-color.svg" alt="" width={36} height={36} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black text-[#1B2A4A]">Ask Fungo</p>
          <p className="text-xs text-slate-500">AI answers about Fungo. They can be wrong.</p>
        </div>
        {turns.length > 0 && (
          <button
            onClick={() => setTurns([])}
            disabled={busy}
            className="h-10 rounded-lg px-2 text-sm font-semibold text-slate-600 underline disabled:opacity-50"
          >
            New chat
          </button>
        )}
        <button
          onClick={() => setOpen(false)}
          aria-label="Close Ask Fungo"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-2xl text-slate-500 hover:bg-slate-100"
        >
          ×
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {turns.length === 0 ? (
          <div>
            <p className="text-base text-slate-700">
              Questions about lineups, pricing, clubs or anything Fungo? Ask away, or start with one
              of these:
            </p>
            <div className="mt-4 flex flex-col items-start gap-2">
              {ASK_STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => void ask(s)}
                  className="rounded-full border-2 border-[#1B2A4A]/15 px-4 py-2 text-left text-sm font-semibold text-[#1B2A4A] hover:border-[#1B2A4A]/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {turns.map((t, i) =>
              t.role === "user" ? (
                <li
                  key={i}
                  className="ml-8 self-end rounded-2xl rounded-br-sm bg-[#1B2A4A] px-4 py-2 text-base text-white"
                >
                  {t.text}
                </li>
              ) : (
                <li
                  key={i}
                  className="mr-4 rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-base text-slate-900"
                >
                  {t.text ? (
                    <Answer text={t.text} onNavigate={() => setOpen(false)} />
                  ) : (
                    <span className="animate-pulse text-slate-500">Thinking…</span>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
        className="border-t border-slate-100 p-3"
      >
        {full ? (
          <button
            type="button"
            onClick={() => setTurns([])}
            className="h-12 w-full rounded-xl bg-[#1B2A4A] text-base font-bold text-white"
          >
            Start a new chat
          </button>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, ASK_MAX_QUESTION))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(draft);
                }
              }}
              rows={1}
              placeholder="Ask a question…"
              aria-label="Your question"
              className="max-h-32 min-h-12 flex-1 resize-none rounded-xl border-2 border-slate-200 px-3 py-2.5 text-base focus:border-[#1B2A4A] focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="h-12 shrink-0 rounded-xl bg-[#DC143C] px-4 text-base font-bold text-white disabled:opacity-40"
            >
              Ask
            </button>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          Don&apos;t share personal details. We keep questions (never who asked) to improve Fungo.{" "}
          <Link href="/privacy" className="underline" onClick={() => setOpen(false)}>
            Privacy
          </Link>
        </p>
      </form>
    </div>
  );
}

function Answer({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {answerBlocks(text).map((block, i) =>
        block.kind === "list" ? (
          <ul key={i} className="ml-5 list-disc">
            {block.lines.map((line, j) => (
              <li key={j}>
                <Pieces pieces={line} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Pieces pieces={line} onNavigate={onNavigate} />
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

function Pieces({ pieces, onNavigate }: { pieces: AnswerPiece[]; onNavigate: () => void }) {
  return (
    <>
      {pieces.map((p, i) =>
        p.kind === "bold" ? (
          <b key={i}>{p.text}</b>
        ) : p.kind === "link" ? (
          p.href.startsWith("mailto:") ? (
            <a key={i} href={p.href} className="font-semibold text-[#DC143C] underline">
              {p.text}
            </a>
          ) : (
            <Link
              key={i}
              href={p.href}
              onClick={onNavigate}
              className="font-semibold text-[#DC143C] underline"
            >
              {p.text}
            </Link>
          )
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
