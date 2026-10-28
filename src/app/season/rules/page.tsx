import type { Metadata } from "next";
import { FairPlayScreen } from "@/components/FairPlayScreen";

export const metadata: Metadata = { title: "Fair play rules" };

export default function FairPlayPage() {
  return <FairPlayScreen />;
}
