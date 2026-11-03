import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

/**
 * Supabase with the service role, for the few server jobs no user is signed in for (Stripe
 * telling us a payment cleared). Never import this from client code. SUPABASE_SERVICE_ROLE_KEY
 * is set in Vercel only.
 */
export function getAdminSupabase(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(supabaseUrl, key, { auth: { persistSession: false } });
}
