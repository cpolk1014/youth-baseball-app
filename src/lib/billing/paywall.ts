// The team paywall, on the server: AI tools and GroupMe posting need a team that has paid
// (a club code or team pass, with 5 days' grace, or its free trial / launch season). The
// database checks the same thing (`team_paid`) for money, GroupMe, stats and the rest.
import type { SupabaseClient } from "@supabase/supabase-js";

export const PAID_FEATURE_MESSAGE =
  "This is part of RallyCap's paid features. A coach can renew the team on Coaches & parents.";

/** Whether the team has paid (or is still free). A failed check counts as not paid. */
export async function teamHasPaid(supabase: SupabaseClient, teamId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("team_paid", { p_team: teamId });
  return !error && data === true;
}
