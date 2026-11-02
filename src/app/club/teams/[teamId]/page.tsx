import { Suspense } from "react";
import { Loading } from "@/components/AppShell";
import { ClubTeamScreen } from "@/components/club/ClubTeamScreen";

export default function ClubTeamPage({ params }: PageProps<"/club/teams/[teamId]">) {
  // Params are request-time data, so they're read inside Suspense (cacheComponents).
  return (
    <Suspense fallback={<Loading />}>
      <TeamFromParams params={params} />
    </Suspense>
  );
}

async function TeamFromParams({ params }: { params: PageProps<"/club/teams/[teamId]">["params"] }) {
  const { teamId } = await params;
  return <ClubTeamScreen teamId={teamId} />;
}
