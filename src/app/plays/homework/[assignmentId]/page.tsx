import { Suspense } from "react";
import { Loading } from "@/components/AppShell";
import { AssignmentScreen } from "@/components/AssignmentScreen";

export default function AssignmentPage({ params }: PageProps<"/plays/homework/[assignmentId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <AssignmentFromParams params={params} />
    </Suspense>
  );
}

async function AssignmentFromParams({
  params,
}: {
  params: PageProps<"/plays/homework/[assignmentId]">["params"];
}) {
  const { assignmentId } = await params;
  return <AssignmentScreen assignmentId={assignmentId} />;
}
