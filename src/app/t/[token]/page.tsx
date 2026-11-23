import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { Suspense } from "react";
import { SharedTournamentScreen } from "@/components/tournaments/SharedTournament";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";
import { fromShared, isShareToken, type SharedTournament } from "@/lib/tournaments/shared";

/** A shared tournament, read with the public key (no sign-in): null when the link is off. */
async function load(token: string): Promise<SharedTournament | null> {
  if (!isSupabaseConfigured || !isShareToken(token)) return null;
  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.rpc("shared_tournament", { p_token: token });
  return error ? null : fromShared(data);
}

export async function generateMetadata({ params }: PageProps<"/t/[token]">): Promise<Metadata> {
  const { token } = await params;
  const shared = await load(token);
  const title = shared ? `${shared.tournament.name}: standings and schedule` : "Tournament";
  return {
    title,
    description: shared
      ? `Standings, scores, the bracket and "What time do we play tomorrow?" for ${shared.tournament.name}, kept up to date on Fungo.`
      : undefined,
    robots: { index: false, follow: false },
    openGraph: shared
      ? { title, siteName: "Fungo", images: [{ url: "/site/og.png", width: 1200, height: 630 }] }
      : undefined,
  };
}

/** fungo.team/t/<token>: a tournament a team shared with the other teams. Anyone can read it. */
export default function SharedTournamentPage({ params }: PageProps<"/t/[token]">) {
  return (
    <Suspense fallback={null}>
      <FromParams params={params} />
    </Suspense>
  );
}

async function FromParams({ params }: { params: PageProps<"/t/[token]">["params"] }) {
  const { token } = await params;
  return <SharedTournamentScreen token={token} initial={await load(token)} />;
}
