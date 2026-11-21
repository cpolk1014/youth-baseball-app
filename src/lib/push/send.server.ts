// Sends push notifications from the server (service role: it reads other people's phones'
// subscriptions and settings). Never import this from client code.
import webpush from "web-push";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { PushPayload } from "./payload";

export type PushCategory = "chatter" | "coach_chatter";

export function pushConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

let ready = false;
function setUp() {
  if (ready) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@rallycap.team",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  ready = true;
}

/** Record that something was announced; false if it already was (send once). */
export async function firstTime(kind: string, refId: string): Promise<boolean> {
  const { data, error } = await getAdminSupabase()
    .from("push_sent")
    .upsert({ kind, ref_id: refId }, { onConflict: "kind,ref_id", ignoreDuplicates: true })
    .select("ref_id");
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Send one notification to these people's phones, skipping anyone who turned this kind off
 * for this team or club. Subscriptions the push service says are gone are removed.
 */
export async function sendPush(
  userIds: string[],
  scope: { id: string; category: PushCategory },
  payload: PushPayload,
): Promise<number> {
  if (!pushConfigured() || userIds.length === 0) return 0;
  setUp();
  const admin = getAdminSupabase();
  const { data: off } = await admin
    .from("notify_pref")
    .select("user_id")
    .eq("scope_id", scope.id)
    .eq("category", scope.category)
    .eq("enabled", false)
    .in("user_id", userIds);
  const skip = new Set((off ?? []).map((r) => r.user_id as string));
  const want = userIds.filter((id) => !skip.has(id));
  if (!want.length) return 0;
  const { data: subs } = await admin
    .from("push_subscription")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", want);
  const body = JSON.stringify(payload);
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint as string,
            keys: { p256dh: s.p256dh as string, auth: s.auth as string },
          },
          body,
          { TTL: 60 * 60 * 12, urgency: "normal" },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id as string);
        else console.error("push failed", status);
      }
    }),
  );
  if (gone.length) await admin.from("push_subscription").delete().in("id", gone);
  return sent;
}
