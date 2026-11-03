import type { Metadata } from "next";
import { MyTeamsScreen } from "@/components/account/MyTeamsScreen";

export const metadata: Metadata = { title: "My teams" };

export default function Page() {
  return <MyTeamsScreen />;
}
