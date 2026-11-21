// The team paywall, on the server: AI tools need a team that has paid
// (a club code or team pass, with 5 days' grace, or its free trial / launch season). The
// database checks the same thing (`team_paid`) for money, Chatter posting, stats and the rest.
import type { SupabaseClient } from "@supabase/supabase-js";

export const PAID_FEATURE_MESSAGE =
  "This is part of Fungo's paid features. A coach can renew the team on Coaches & parents.";

/** Whether the team has paid (or is still free). A failed check counts as not paid. */
export async function teamHasPaid(supabase: SupabaseClient, teamId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("team_paid", { p_team: teamId });
  return !error && data === true;
}

export const CLUB_PAID_FEATURE_MESSAGE =
  "Reading a flyer is a paid feature. Buy codes for your teams on the club page, then try again.";

/** Whether a club has bought codes that haven't expired. A failed check counts as not paid. */
export async function clubHasPaid(supabase: SupabaseClient, clubId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from("club_code")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", clubId)
    .gte("expires_on", today);
  return !error && (count ?? 0) > 0;
}
