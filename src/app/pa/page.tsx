import type { Metadata } from "next";
import { PaScreen } from "@/components/pa/PaScreen";

export const metadata: Metadata = { title: "Gameday PA" };

export default function PaPage() {
  return <PaScreen />;
}
