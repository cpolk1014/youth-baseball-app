import { Suspense } from "react";
import { Loading } from "@/components/AppShell";
import { PracticeScreen } from "@/components/PracticeScreen";

export default function PracticePage({ params }: PageProps<"/practices/[practiceId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <PracticeFromParams params={params} />
    </Suspense>
  );
}

async function PracticeFromParams({
  params,
}: {
  params: PageProps<"/practices/[practiceId]">["params"];
}) {
  const { practiceId } = await params;
  return <PracticeScreen practiceId={practiceId} />;
}
