import type { Metadata } from "next";
import { ChatterScreen } from "@/components/chatter/ChatterScreen";

export const metadata: Metadata = { title: "Chatter" };

export default function ChatterPage() {
  return <ChatterScreen />;
}
