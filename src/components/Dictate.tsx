"use client";

// A microphone on the AI prompt boxes: tap, talk, and the words go in the box.
// Uses the browser's own speech recognition (Chrome, Edge, Safari); where there
// isn't any (Firefox), no button shows and the phone keyboard's mic still works.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { insertDictation } from "@/lib/dictation/join";

type Alternative = { transcript: string };
type Result = ArrayLike<Alternative> & { isFinal: boolean };
type ResultEvent = { resultIndex: number; results: ArrayLike<Result> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};
/** Whether this browser can dictate (false while the page is built on the server). */
export function useCanDictate() {
  return useSyncExternalStore(
    noSubscribe,
    () => recognition() !== null,
    () => false,
  );
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Allow the microphone for RallyCap to talk instead of typing.",
  "service-not-allowed": "Dictation is off on this device. Try the mic on your keyboard.",
  "audio-capture": "No microphone found.",
  network: "Dictation needs a connection.",
};

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" />
    </svg>
  );
}

/** The mic button. Put it inside a `relative` box next to the field (see `MicField`). */
export function DictateButton({
  value,
  onChange,
  maxLength,
  onWords,
  getField,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  /** After words land at the end of the box (MicField scrolls the box to them). */
  onWords?: () => void;
  /** The text box, so words go where the cursor is (or replace what's selected). */
  getField?: () => HTMLInputElement | HTMLTextAreaElement | null;
  className?: string;
}) {
  const can = useCanDictate();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What it's hearing, shown by the mic while listening (so it's visible even when the
  // words land below the fold of a long box).
  const [live, setLive] = useState("");
  const rec = useRef<Recognition | null>(null);
  // Where the cursor (or selection) was in the box when the mic was pressed; null when
  // the box wasn't being typed in (then the words go at the end).
  const cursor = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => () => rec.current?.abort(), []);

  if (!can) return null;

  const start = () => {
    const Ctor = recognition();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    const base = value;
    const at = cursor.current ?? { start: base.length, end: base.length };
    const atEnd = at.start >= base.length;
    let caret = at.end;
    let words = "";
    let gotAudio = false;
    let failed = false;
    r.onaudiostart = () => {
      gotAudio = true;
    };
    r.onresult = (e) => {
      // Rebuild from every result each time: browsers differ in which results they
      // resend (Safari repeats finished ones), so this never drops or doubles words.
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i]?.[0]?.transcript ?? "");
      words = parts.join(" ").replace(/\s+/g, " ").trim();
      setLive(words);
      const next = insertDictation(base, at.start, at.end, words, maxLength);
      caret = next.caret;
      onChange(next.text);
      if (atEnd) onWords?.();
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      failed = true;
      setError(ERRORS[e.error] ?? "Dictation didn't work. Try the mic on your keyboard.");
    };
    r.onend = () => {
      setListening(false);
      setLive("");
      rec.current = null;
      if (words && cursor.current) {
        // They were typing in the box: put them back there, right after the new words.
        const field = getField?.();
        if (field) {
          field.focus();
          field.setSelectionRange(caret, caret);
        }
      }
      cursor.current = null;
      if (words || failed) return;
      // Ended without a word and without saying why: tell them what we know.
      setError(
        gotAudio
          ? "The mic heard you, but this browser didn't send back any words. Dictation works in Chrome, Edge and Safari; some browsers (like Arc or Brave) can't. You can also use your keyboard's dictation."
          : "The microphone didn't turn on. Check that this browser is allowed to use the mic, then try again.",
      );
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Dictation didn't start. Try again.");
    }
  };

  return (
    <span className={`absolute z-10 ${className}`}>
      <button
        type="button"
        onPointerDown={() => {
          // Before the box loses focus to the button: note the cursor, if they were in it.
          const field = getField?.();
          cursor.current =
            !listening && field && document.activeElement === field
              ? { start: field.selectionStart ?? 0, end: field.selectionEnd ?? 0 }
              : listening
                ? cursor.current
                : null;
        }}
        onClick={() => (listening ? rec.current?.stop() : start())}
        aria-label={listening ? "Stop dictating" : "Dictate: talk instead of typing"}
        aria-pressed={listening}
        title={listening ? "Stop" : "Talk instead of typing"}
        className={`flex size-11 items-center justify-center rounded-full transition ${
          listening
            ? "animate-pulse bg-red-600 text-white shadow-lg shadow-red-600/30"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300"
        }`}
      >
        <MicIcon />
      </button>
      <span role="status" className="sr-only">
        {listening ? "Listening. Tap the mic again when you're done." : ""}
      </span>
      {listening && (
        <span
          aria-hidden="true"
          className="absolute top-full right-0 mt-1 w-56 rounded-lg bg-red-600 px-3 py-2 text-sm text-white shadow-lg"
        >
          {live ? `“…${live.slice(-80)}”` : "Listening… say something, then tap the mic."}
        </span>
      )}
      {!listening && error && (
        <span
          role="alert"
          className="absolute top-full right-0 mt-1 w-56 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg"
        >
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * A text box with the mic in its corner. Give the field right padding (`pr-14`) so
 * words don't run under the button.
 */
export function MicField({
  value,
  onChange,
  maxLength,
  multiline = false,
  children,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  multiline?: boolean;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Show the new words: they're added at the end, which a long box may have scrolled
  // past. Scroll once the box has the new text (after React updates it).
  const scrollPending = useRef(false);
  const toEnd = () => {
    scrollPending.current = true;
  };
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    const field = box.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "textarea, input",
    );
    if (!field) return;
    field.scrollTop = field.scrollHeight;
    field.scrollLeft = field.scrollWidth;
  }, [value]);
  return (
    <div ref={box} className="relative">
      {children}
      <DictateButton
        value={value}
        onChange={onChange}
        onWords={toEnd}
        getField={() =>
          box.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>("textarea, input") ??
          null
        }
        maxLength={maxLength}
        className={multiline ? "top-2 right-2" : "top-1/2 right-1 -translate-y-1/2"}
      />
    </div>
  );
}
