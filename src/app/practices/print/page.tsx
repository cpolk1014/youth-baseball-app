import type { Metadata } from "next";
import { PracticeScheduleScreen } from "@/components/PracticeScheduleScreen";

export const metadata: Metadata = { title: "Practice schedule" };

export default function PracticeSchedulePrintPage() {
  return <PracticeScheduleScreen />;
}
