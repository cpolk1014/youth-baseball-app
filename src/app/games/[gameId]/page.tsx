import { Suspense } from "react";
import { Loading } from "@/components/AppShell";
import { GameScreen } from "@/components/GameScreen";

export default function GamePage({ params }: PageProps<"/games/[gameId]">) {
  // Params are request-time data, so they're read inside Suspense (cacheComponents).
  return (
    <Suspense fallback={<Loading />}>
      <GameFromParams params={params} />
    </Suspense>
  );
}

async function GameFromParams({ params }: { params: PageProps<"/games/[gameId]">["params"] }) {
  const { gameId } = await params;
  return <GameScreen gameId={gameId} />;
}
