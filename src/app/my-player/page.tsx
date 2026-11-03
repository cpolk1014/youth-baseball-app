import type { Metadata } from "next";
import { KidStatsScreen } from "@/components/kidstats/KidStatsScreen";

export const metadata: Metadata = { title: "My player" };

export default function MyPlayerPage() {
  return <KidStatsScreen />;
}
