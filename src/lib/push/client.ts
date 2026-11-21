// Push notifications in the browser: whether this phone can get them, turning them on and
// off, and asking the server to announce a new post. Fungo's service worker shows them.
import { getBrowserSupabase } from "@/lib/supabase/client";
import { keyBytes } from "./payload";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushState =
  | "unsupported" // this browser can't, or the site isn't set up for push
  | "install" // iPhone or iPad in Safari: add Fungo to the Home Screen first
  | "blocked" // the person said no; only the phone's settings can undo it
  | "off"
  | "on";

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const installed = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Service workers run only in production builds (see OfflineSupport). */
const swAllowed = () => process.env.NODE_ENV === "production" && "serviceWorker" in navigator;

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !PUBLIC_KEY) return "unsupported";
  if (isIos() && !installed()) return "install";
  if (!swAllowed() || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Ask permission (must follow a tap) and save this phone's subscription. */
export async function turnOnPush(): Promise<PushState> {
  if ((await pushState()) === "unsupported") return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const reg =
    (await navigator.serviceWorker.getRegistration()) ??
    (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(PUBLIC_KEY) as BufferSource,
    }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await getBrowserSupabase().rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
  });
  if (error) throw new Error("Couldn't turn notifications on. Try again.");
  return "on";
}

/** Stop notifications on this phone. */
export async function turnOffPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await getBrowserSupabase().from("push_subscription").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe().catch(() => undefined);
}

/** After posting: let the team (or the club's coaches) know. Never blocks or fails the post. */
export function announce(kind: "chatter" | "club" | "coach", id: string): void {
  if (!PUBLIC_KEY) return;
  void fetch("/api/push/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, id }),
    keepalive: true,
  }).catch(() => undefined);
}

export type NotifyCategory = "chatter" | "coach_chatter";

/** Whether this person gets this kind for this team or club (on unless they turned it off). */
export async function notifyEnabled(scopeId: string, category: NotifyCategory): Promise<boolean> {
  const { data } = await getBrowserSupabase()
    .from("notify_pref")
    .select("enabled")
    .eq("scope_id", scopeId)
    .eq("category", category)
    .maybeSingle();
  return data ? data.enabled !== false : true;
}

export async function setNotifyEnabled(
  userId: string,
  scopeId: string,
  category: NotifyCategory,
  enabled: boolean,
): Promise<void> {
  const { error } = await getBrowserSupabase()
    .from("notify_pref")
    .upsert({ user_id: userId, scope_id: scopeId, category, enabled });
  if (error) throw new Error("Couldn't save that. Try again.");
}
