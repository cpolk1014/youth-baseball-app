import type { Metadata } from "next";
import { KidStatsScreen } from "@/components/kidstats/KidStatsScreen";

export const metadata: Metadata = { title: "My player's stats" };

export default function MyStatsPage() {
  return <KidStatsScreen />;
}
