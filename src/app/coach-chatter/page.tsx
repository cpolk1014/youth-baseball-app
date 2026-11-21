import type { Metadata } from "next";
import { Suspense } from "react";
import { CoachChatterScreen } from "@/components/chatter/CoachChatterScreen";

export const metadata: Metadata = { title: "Coach Chatter" };

export default function CoachChatterPage() {
  return (
    <Suspense>
      <CoachChatterScreen />
    </Suspense>
  );
}
