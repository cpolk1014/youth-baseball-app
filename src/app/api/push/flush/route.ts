import { NextResponse } from "next/server";
import { chargesPush, gamesPush, type ChargeEvent, type GameEvent } from "@/lib/push/payload";
import { pushConfigured, sendPush } from "@/lib/push/send.server";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * Sends the team notices that are due (game changes, new charges). Supabase calls this every
 * 5 minutes (start_team_notifications). It needs no sign-in and is safe to call any time:
 * the database decides what's due (settled for 10 minutes, daytime, the team still sends that
 * kind) and hands each notice out only once.
 */
export async function POST() {
  if (!pushConfigured()) return NextResponse.json({ sent: 0 });
  const { data, error } = await getAdminSupabase().rpc("take_due_notifications");
  if (error) {
    console.error("take_due_notifications failed", error.message);
    return NextResponse.json({ sent: 0 }, { status: 500 });
  }
  const rows = (data ?? []) as {
    team_id: string;
    team_name: string;
    kind: "games" | "money";
    user_ids: string[];
    events: unknown[];
  }[];
  let sent = 0;
  for (const row of rows) {
    const payload =
      row.kind === "games"
        ? gamesPush(row.team_id, row.team_name, row.events as GameEvent[])
        : chargesPush(row.team_id, row.team_name, row.events as ChargeEvent[]);
    sent += await sendPush(row.user_ids, { id: row.team_id, category: row.kind }, payload);
  }
  return NextResponse.json({ sent });
}
