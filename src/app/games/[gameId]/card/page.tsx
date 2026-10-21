import { Suspense } from "react";
import { Loading } from "@/components/AppShell";
import { LineupCardScreen } from "@/components/LineupCardScreen";

export default function LineupCardPage({ params }: PageProps<"/games/[gameId]/card">) {
  return (
    <Suspense fallback={<Loading />}>
      <CardFromParams params={params} />
    </Suspense>
  );
}

async function CardFromParams({ params }: { params: PageProps<"/games/[gameId]/card">["params"] }) {
  const { gameId } = await params;
  return <LineupCardScreen gameId={gameId} />;
}
