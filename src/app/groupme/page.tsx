import type { Metadata } from "next";
import { GroupMeScreen } from "@/components/GroupMeScreen";

export const metadata: Metadata = { title: "GroupMe" };

export default function GroupMePage() {
  return <GroupMeScreen />;
}
