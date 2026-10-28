import type { Metadata } from "next";
import { BudgetScreen } from "@/components/BudgetScreen";

export const metadata: Metadata = { title: "Budget" };

export default function BudgetPage() {
  return <BudgetScreen />;
}
