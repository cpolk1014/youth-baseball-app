import { supabaseUrl } from "@/lib/supabase/config";

/** A team logo's public address, or a data URL as-is (local mode). */
export function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("data:")) return path;
  return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/team-logos/${path}` : null;
}
