import { Suspense } from "react";
import { Loading } from "@/components/AppShell";
import { TournamentScreen } from "@/components/tournaments/TournamentScreen";

export default function TournamentPage({ params }: PageProps<"/tournaments/[tournamentId]">) {
  // Params are request-time data, so they're read inside Suspense (cacheComponents).
  return (
    <Suspense fallback={<Loading />}>
      <TournamentFromParams params={params} />
    </Suspense>
  );
}

async function TournamentFromParams({
  params,
}: {
  params: PageProps<"/tournaments/[tournamentId]">["params"];
}) {
  const { tournamentId } = await params;
  return <TournamentScreen id={tournamentId} />;
}
