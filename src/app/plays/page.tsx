import type { Metadata } from "next";
import { PlaysScreen } from "@/components/PlaysScreen";

export const metadata: Metadata = { title: "Plays" };

export default function PlaysPage() {
  return <PlaysScreen />;
}
