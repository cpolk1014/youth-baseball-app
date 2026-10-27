import { Suspense } from "react";
import { Loading } from "@/components/AppShell";
import { PlayScreen } from "@/components/PlayScreen";

export default function PlayPage({ params }: PageProps<"/plays/[playId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <PlayFromParams params={params} />
    </Suspense>
  );
}

async function PlayFromParams({ params }: { params: PageProps<"/plays/[playId]">["params"] }) {
  const { playId } = await params;
  return <PlayScreen playId={playId} />;
}
