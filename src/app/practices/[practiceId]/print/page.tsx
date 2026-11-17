import { Suspense } from "react";
import { Loading } from "@/components/AppShell";
import { PracticePrintScreen } from "@/components/PracticePrintScreen";

export default function PracticePrintPage({ params }: PageProps<"/practices/[practiceId]/print">) {
  return (
    <Suspense fallback={<Loading />}>
      <PrintFromParams params={params} />
    </Suspense>
  );
}

async function PrintFromParams({
  params,
}: {
  params: PageProps<"/practices/[practiceId]/print">["params"];
}) {
  const { practiceId } = await params;
  return <PracticePrintScreen practiceId={practiceId} />;
}
