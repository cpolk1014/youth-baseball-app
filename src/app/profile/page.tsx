import type { Metadata } from "next";
import { ProfileScreen } from "@/components/account/ProfileScreen";

export const metadata: Metadata = { title: "My profile" };

export default function Page() {
  return <ProfileScreen />;
}
