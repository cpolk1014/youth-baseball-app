import type { Metadata } from "next";
import { MembersScreen } from "@/components/MembersScreen";

export const metadata: Metadata = { title: "Team members" };

export default function MembersPage() {
  return <MembersScreen />;
}
