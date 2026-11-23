import type { Metadata } from "next";
import { DemoStart } from "@/components/demo/DemoStart";

export const metadata: Metadata = { title: "Try the demo club" };

export default function DemoPage() {
  return <DemoStart />;
}
