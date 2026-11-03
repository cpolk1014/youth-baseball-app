import type { Metadata } from "next";
import { MyClubsScreen } from "@/components/account/MyClubsScreen";

export const metadata: Metadata = { title: "My clubs" };

export default function Page() {
  return <MyClubsScreen />;
}
