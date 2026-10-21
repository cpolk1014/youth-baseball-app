"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./config";

let client: SupabaseClient | null = null;

/** Browser Supabase client. The session lives in cookies the proxy keeps fresh. */
export function getBrowserSupabase(): SupabaseClient {
  client ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}
