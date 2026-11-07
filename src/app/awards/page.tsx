import type { Metadata } from "next";
import { AwardsScreen } from "@/components/awards/AwardsScreen";

export const metadata: Metadata = { title: "Club awards" };

export default function AwardsPage() {
  return <AwardsScreen />;
}
