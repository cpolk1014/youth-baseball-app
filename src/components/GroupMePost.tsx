"use client";

import { useState } from "react";
import { postToGroupMe } from "@/lib/data/store";

/** An editable message and a Send button that posts it to the team's GroupMe group. */
export function GroupMePost({
  initialText,
  placeholder,
  onSent,
  rows = 6,
}: {
  initialText: string;
  placeholder?: string;
  onSent?: () => void;
  rows?: number;
}) {
  const [text, setText] = useState(initialText);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setState("sending");
    setError(null);
    try {
      await postToGroupMe(text);
      setState("sent");
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post to GroupMe.");
      setState("idle");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (state === "sent") setState("idle");
        }}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 font-mono text-sm leading-snug focus:border-[#0b1f3a] focus:outline-none"
      />
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {error}
        </p>
      )}
      {state === "sent" && (
        <p
          role="status"
          className="rounded-xl bg-green-50 p-3 text-base font-semibold text-green-900"
        >
          Posted to the team&apos;s GroupMe.
        </p>
      )}
      <button
        onClick={() => void send()}
        disabled={!text.trim() || state === "sending"}
        className="h-14 rounded-xl bg-[#00aff0] text-lg font-bold text-white active:bg-[#0096cc] disabled:opacity-40"
      >
        {state === "sending" ? "Posting…" : "Post to GroupMe"}
      </button>
    </div>
  );
}
