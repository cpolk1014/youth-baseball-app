import { Suspense } from "react";
import { Loading } from "@/components/AppShell";
import { BracketScreen } from "@/components/tournaments/BracketScreen";

export default function BracketPage({ params }: PageProps<"/tournaments/[tournamentId]/bracket">) {
  // Params are request-time data, so they're read inside Suspense (cacheComponents).
  return (
    <Suspense fallback={<Loading />}>
      <BracketFromParams params={params} />
    </Suspense>
  );
}

async function BracketFromParams({
  params,
}: {
  params: PageProps<"/tournaments/[tournamentId]/bracket">["params"];
}) {
  const { tournamentId } = await params;
  return <BracketScreen id={tournamentId} />;
}
