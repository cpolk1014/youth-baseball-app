import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinScreen } from "@/components/JoinScreen";

export const metadata: Metadata = { title: "Join a team" };

export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <Suspense fallback={null}>
      <JoinFromParams params={params} />
    </Suspense>
  );
}

async function JoinFromParams({ params }: { params: PageProps<"/join/[token]">["params"] }) {
  const { token } = await params;
  return <JoinScreen token={token} />;
}
