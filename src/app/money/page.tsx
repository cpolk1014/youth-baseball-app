import type { Metadata } from "next";
import { MoneyScreen } from "@/components/MoneyScreen";

export const metadata: Metadata = { title: "Team money" };

export default function MoneyPage() {
  return <MoneyScreen />;
}
