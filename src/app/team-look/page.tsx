import type { Metadata } from "next";
import { TeamLookScreen } from "@/components/TeamLookScreen";

export const metadata: Metadata = { title: "Team colors & logo" };

export default function TeamLookPage() {
  return <TeamLookScreen />;
}
