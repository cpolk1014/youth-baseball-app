import type { Metadata } from "next";
import { RosterScreen } from "@/components/RosterScreen";

export const metadata: Metadata = { title: "Roster" };

export default function RosterPage() {
  return <RosterScreen />;
}
