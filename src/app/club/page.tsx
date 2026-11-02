import type { Metadata } from "next";
import { ClubScreen } from "@/components/club/ClubScreen";

export const metadata: Metadata = { title: "Club" };

export default function ClubPage() {
  return <ClubScreen />;
}
