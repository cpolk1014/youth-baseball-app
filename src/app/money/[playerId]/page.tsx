import { Suspense } from "react";
import { Loading } from "@/components/AppShell";
import { PlayerMoneyScreen } from "@/components/PlayerMoneyScreen";

export default function PlayerMoneyPage({ params }: PageProps<"/money/[playerId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <PlayerMoneyFromParams params={params} />
    </Suspense>
  );
}

async function PlayerMoneyFromParams({
  params,
}: {
  params: PageProps<"/money/[playerId]">["params"];
}) {
  const { playerId } = await params;
  return <PlayerMoneyScreen playerId={playerId} />;
}
