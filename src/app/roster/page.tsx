import type { Metadata } from "next";
import { RosterScreen } from "@/components/RosterScreen";

export const metadata: Metadata = { title: "Roster · Dugout Lineups" };

export default function RosterPage() {
  return <RosterScreen />;
}
