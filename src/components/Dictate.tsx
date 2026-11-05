"use client";

// A microphone on the AI prompt boxes: tap, talk, and the words go in the box.
// Uses the browser's own speech recognition (Chrome, Edge, Safari); where there
// isn't any (Firefox), no button shows and the phone keyboard's mic still works.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { joinDictation } from "@/lib/dictation/join";

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
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  className?: string;
}) {
  const can = useCanDictate();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);

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
    let heard = "";
    r.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res) continue;
        const words = res[0]?.transcript ?? "";
        if (res.isFinal) heard += ` ${words}`;
        else pending += ` ${words}`;
      }
      onChange(joinDictation(base, heard + pending, maxLength));
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(ERRORS[e.error] ?? "Dictation didn't work. Try the mic on your keyboard.");
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
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
      {error && (
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
  return (
    <div className="relative">
      {children}
      <DictateButton
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        className={multiline ? "top-2 right-2" : "top-1/2 right-1 -translate-y-1/2"}
      />
    </div>
  );
}
