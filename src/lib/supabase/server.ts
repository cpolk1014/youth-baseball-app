import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./config";

/** Supabase client for route handlers, acting as the signed-in user. */
export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
      },
    },
  });
}
