"use client";

// An editable message and a "Post to Chatter" button: the batting order from a game, a new
// Bat Around, tournament seeds, a game day post now. It posts to the team's Chatter as the
// person, and the team gets a notification.
import Link from "next/link";
import { useState } from "react";
import { announce } from "@/lib/push/client";
import { useAppData } from "@/lib/data/store";
import { PaidGate, usePlan } from "../paywall";
import { usePostCheck } from "./SaveMe";

export function ChatterPostBox({
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
  const data = useAppData();
  const [text, setText] = useState(initialText);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsAgree, setNeedsAgree] = useState(false);
  const { paid } = usePlan();
  const postCheck = usePostCheck(data?.me.userId);

  const send = async () => {
    if (!data?.me.userId) return;
    const ok = await postCheck.confirm({
      where: "parents",
      name: data.team.name,
      body: text.trim(),
      staff: data.me.role !== "parent" && data.me.role !== "treasurer",
    });
    if (!ok) return;
    setState("sending");
    setError(null);
    setNeedsAgree(false);
    try {
      const m = await import("@/lib/data/chatter-backend");
      const post = await m.sendPost(data.team.id, data.me.userId, text.trim(), null);
      announce("chatter", post.id);
      setState("sent");
      onSent?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't post to Chatter.";
      setNeedsAgree(/agree/i.test(msg));
      setError(msg);
      setState("idle");
    }
  };

  // Posting in Chatter is a paid feature.
  if (!paid) return <PaidGate feature="Posting to Chatter">{null}</PaidGate>;
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
        maxLength={2000}
        className="w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-base leading-snug focus:border-[var(--team)] focus:outline-none"
      />
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {needsAgree ? (
            <>
              Open{" "}
              <Link href="/chatter" className="underline">
                Chatter
              </Link>{" "}
              once and agree to its rules, then post this again.
            </>
          ) : (
            error
          )}
        </p>
      )}
      {state === "sent" && (
        <p
          role="status"
          className="rounded-xl bg-green-50 p-3 text-base font-semibold text-green-900"
        >
          Posted to the team&apos;s Chatter.{" "}
          <Link href="/chatter" className="underline">
            Open Chatter
          </Link>
        </p>
      )}
      <button
        onClick={() => void send()}
        disabled={!text.trim() || state === "sending"}
        className="h-14 rounded-xl bg-[var(--team)] text-lg font-bold text-white active:bg-[var(--team-press)] disabled:opacity-40"
      >
        {state === "sending" ? "Posting…" : "Post to Chatter"}
      </button>
      {postCheck.sheet}
    </div>
  );
}
