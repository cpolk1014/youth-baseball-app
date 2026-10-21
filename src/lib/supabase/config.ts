// Supabase is used when both public env vars are set; otherwise the app runs on
// local (browser-only) data.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const isSupabaseConfigured = supabaseUrl !== "" && supabaseAnonKey !== "";
