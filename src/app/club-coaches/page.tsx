import type { Metadata } from "next";
import { Suspense } from "react";
import { ClubCoachesScreen } from "@/components/chatter/ClubCoachesScreen";

export const metadata: Metadata = { title: "Club coaches" };

export default function ClubCoachesPage() {
  return (
    <Suspense>
      <ClubCoachesScreen />
    </Suspense>
  );
}
