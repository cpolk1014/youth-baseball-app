import type { Metadata } from "next";
import { GamesScreen } from "@/components/GamesScreen";

export const metadata: Metadata = { title: "Games · Dugout Lineups" };

export default function GamesPage() {
  return <GamesScreen />;
}
