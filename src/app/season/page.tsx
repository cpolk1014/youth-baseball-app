import type { Metadata } from "next";
import { SeasonScreen } from "@/components/SeasonScreen";

export const metadata: Metadata = { title: "Playing time · Dugout Lineups" };

export default function SeasonPage() {
  return <SeasonScreen />;
}
