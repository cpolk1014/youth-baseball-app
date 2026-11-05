"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { isCoach } from "@/lib/data/permissions";
import { useAppData } from "@/lib/data/store";
import type { TeamPlan } from "@/lib/data/types";

const day = (d: string) =>
  new Date(`${d}T12:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** Days from today to a date (0 = today). */
function daysUntil(d: string): number {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((new Date(`${d}T12:00`).getTime() - today.getTime()) / 86400000);
}

/** The open team's plan; local mode (no sign-in) has none and everything is open. */
export function usePlan(): { paid: boolean; plan: TeamPlan | null; canPay: boolean } {
  const data = useAppData();
  const plan = data?.plan ?? null;
  return {
    paid: plan ? plan.paid : true,
    plan,
    // Coaches (and the owner) pay for the team's season.
    canPay: !!data && isCoach(data.me.role),
  };
}

/** Shown in place of a paid feature when the team hasn't paid. */
export function PaidGate({ feature, children }: { feature: string; children: ReactNode }) {
  const { paid, canPay } = usePlan();
  if (paid) return <>{children}</>;
  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-4">
      <p className="text-lg font-bold">🔒 {feature} is a paid feature</p>
      <p className="text-base text-slate-700">
        Everything your team already made stays right where it is. To add more, renew the team ($129
        a season) or join a club.
      </p>
      {canPay ? (
        <Link
          href="/members#plan"
          className="flex h-12 items-center justify-center rounded-xl bg-[var(--team)] text-base font-bold text-white"
        >
          Renew the team
        </Link>
      ) : (
        <p className="text-sm text-slate-600">Ask your coach to renew the team.</p>
      )}
    </div>
  );
}

/** One line about the team's plan, for Coaches & parents. */
export function planLine(plan: TeamPlan): string {
  switch (plan.kind) {
    case "club":
      return `Paid through ${day(plan.until!)} by the team's club.`;
    case "pass":
      return `Paid through ${day(plan.until!)}.`;
    case "grace":
      return `The season ended ${day(plan.ends!)}. Paid features keep working through ${day(plan.until!)}; renew to keep them.`;
    case "trial":
      return `Free trial: all of RallyCap through ${day(plan.until!)}.`;
    case "launch":
      return `Free through ${day(plan.until!)}: thanks for being one of RallyCap's first teams.`;
    default:
      return "Paid features are locked. Everything your team made stays; renew to add more.";
  }
}

/** Is it time to remind coaches to renew? (Trial or season ending soon, or already locked.) */
export function renewReminder(plan: TeamPlan, today = new Date()): string | null {
  if (plan.kind === "none") return "Paid features are locked. Renew the team to turn them back on.";
  if (plan.kind === "grace")
    return `Your season ended. Paid features stop after ${day(plan.until!)}: renew now.`;
  if (plan.kind === "trial" && plan.until && daysUntil(plan.until) <= 7) {
    const n = daysUntil(plan.until);
    return n <= 0
      ? "Your free trial ends today."
      : `Your free trial ends in ${n} day${n === 1 ? "" : "s"}.`;
  }
  // From June 1, until next season is paid.
  const june = today.getMonth() >= 5 && today.getMonth() <= 6;
  if (
    june &&
    !plan.nextSeason &&
    (plan.kind === "pass" || plan.kind === "launch" || plan.kind === "club")
  ) {
    return plan.kind === "club"
      ? "Next season is coming: your club's code ends July 31."
      : "Renew for next season: this one ends July 31.";
  }
  return null;
}

/** A reminder strip for coaches on Home and Games. */
export function PlanBanner() {
  const { plan, canPay } = usePlan();
  if (!plan || !canPay) return null;
  const text = renewReminder(plan);
  if (!text) return null;
  return (
    <Link
      href="/members#plan"
      className={`mb-4 flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 px-4 py-2 text-base font-semibold ${
        plan.kind === "none"
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-amber-500 bg-amber-50 text-amber-950"
      }`}
    >
      <span>{text}</span>
      <span className="shrink-0 font-bold underline">Renew</span>
    </Link>
  );
}
