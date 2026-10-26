import type { Metadata } from "next";
import { PracticesScreen } from "@/components/PracticesScreen";

export const metadata: Metadata = { title: "Practices" };

export default function PracticesPage() {
  return <PracticesScreen />;
}
