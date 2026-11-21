// Every AI call goes through the ledger: reserve before it runs (as the person, so the
// database checks their caps and the team's season budget, under a lock), then record what
// it really cost, or give the reservation back if it failed. Recording and giving back use
// the service role, so nobody can rewrite their own usage.
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { claudeCents, type ClaudeUsage } from "./cost";

export type AiKind =
  | "roster"
  | "schedule"
  | "boxscore"
  | "uniform"
  | "tournament"
  | "tournament_scores"
  | "rules"
  | "practice"
  | "lyrics"
  | "song"
  | "announce"
  | "sound"
  | "highlight_write"
  | "highlight_voice";

export class AiCall {
  private recorded = false;
  constructor(readonly id: string) {}

  /** Record what the call cost, in cents. */
  async charge(cents: number): Promise<void> {
    this.recorded = true;
    // Never let bookkeeping break the feature: the reservation already counts.
    try {
      const { error } = await getAdminSupabase().rpc("ai_settle", {
        p_id: this.id,
        p_cost_cents: cents,
      });
      if (error) console.error("ai_settle failed", error.message);
    } catch (e) {
      console.error("ai_settle failed", e);
    }
  }

  /** Record a Claude response's cost from its usage. */
  claude(response: { model?: string; usage?: ClaudeUsage | null }, model: string) {
    return this.charge(claudeCents(response.model ?? model, response.usage));
  }

  /** Call in `finally`: gives the reservation back when nothing was charged (it failed). */
  async finish(): Promise<void> {
    if (this.recorded) return;
    try {
      const { error } = await getAdminSupabase().rpc("ai_release", { p_id: this.id });
      if (error) console.error("ai_release failed", error.message);
    } catch (e) {
      console.error("ai_release failed", e);
    }
  }
}

/**
 * Reserve one AI call for a team (or a club's flyer reader). Returns the call, or a response
 * to send back: 429 at a cap, 402 when the season's AI budget is used, 403 if not allowed.
 */
export async function beginAi(
  supabase: SupabaseClient,
  scope: { teamId: string } | { clubId: string },
  kind: AiKind,
): Promise<{ ok: true; call: AiCall } | { ok: false; response: NextResponse }> {
  const { data, error } = await supabase.rpc("ai_reserve", {
    p_team: "teamId" in scope ? scope.teamId : null,
    p_club: "clubId" in scope ? scope.clubId : null,
    p_kind: kind,
  });
  if (!error && typeof data === "string") return { ok: true, call: new AiCall(data) };
  const status =
    error?.code === "P0429"
      ? 429
      : error?.code === "P0430"
        ? 402
        : error?.code === "42501"
          ? 403
          : 500;
  const message =
    status === 500 ? "Couldn't check today's limits. Try again." : (error?.message ?? "Try again.");
  if (status === 500) console.error("ai_reserve failed", error?.message);
  return { ok: false, response: NextResponse.json({ error: message }, { status }) };
}
