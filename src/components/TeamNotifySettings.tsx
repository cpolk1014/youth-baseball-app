"use client";

// Coaches & parents → Team notifications (coaches and managers): what Fungo sends the team.
// Each person can still mute any of these for themselves on My profile.
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Key = "notify_chatter" | "notify_games" | "notify_money" | "notify_stats";

const CHOICES: { key: Key; label: string; note: string }[] = [
  { key: "notify_chatter", label: "Chatter posts", note: "New posts, polls and club posts." },
  {
    key: "notify_games",
    label: "Game changes",
    note: "Games added, moved or taken off the schedule in the next two weeks. Changes made close together go out as one notification.",
  },
  {
    key: "notify_money",
    label: "New charges",
    note: "Only to the families a charge is for, during the day.",
  },
  {
    key: "notify_stats",
    label: "Box scores",
    note: "When you add a box score, each family hears how their kid did, during the day. Families with a Player pass see the line; others see that it's in.",
  },
];

export function TeamNotifySettings({ teamId }: { teamId: string }) {
  const [values, setValues] = useState<Record<Key, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let current = true;
    void getBrowserSupabase()
      .from("team")
      .select("notify_chatter, notify_games, notify_money, notify_stats")
      .eq("id", teamId)
      .maybeSingle()
      .then(({ data }) => {
        if (current && data) setValues(data as Record<Key, boolean>);
      });
    return () => {
      current = false;
    };
  }, [teamId]);

  if (!values) return null;

  const set = async (key: Key, on: boolean) => {
    setError(null);
    setValues({ ...values, [key]: on });
    const { error: e } = await getBrowserSupabase()
      .from("team")
      .update({ [key]: on })
      .eq("id", teamId);
    if (e) {
      setValues((v) => (v ? { ...v, [key]: !on } : v));
      setError("Couldn't save that. Try again.");
    }
  };

  return (
    <section className="mb-6 rounded-xl border-2 border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-bold tracking-wide text-slate-600 uppercase">
        Team notifications
      </h2>
      <p className="mb-2 text-base text-slate-700">
        What Fungo sends to the phones of people on this team who turned notifications on. Anyone
        can still mute any of these for themselves on My profile.
      </p>
      <ul className="flex flex-col">
        {CHOICES.map((c) => (
          <li key={c.key}>
            <label className="flex min-h-14 items-center justify-between gap-3 py-1">
              <span className="min-w-0">
                <span className="block text-base font-semibold">{c.label}</span>
                <span className="block text-sm text-slate-600">{c.note}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={values[c.key]}
                onChange={(e) => void set(c.key, e.target.checked)}
                className="size-6 shrink-0 accent-[var(--team)]"
              />
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="text-base text-red-700">{error}</p>}
    </section>
  );
}
