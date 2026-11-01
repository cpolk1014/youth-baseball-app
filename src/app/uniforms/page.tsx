import type { Metadata } from "next";
import { UniformsScreen } from "@/components/uniforms/UniformsScreen";

export const metadata: Metadata = { title: "Uniforms" };

export default function UniformsPage() {
  return <UniformsScreen />;
}
