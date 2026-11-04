import type { Metadata } from "next";
import { TournamentsScreen } from "@/components/tournaments/TournamentsScreen";

export const metadata: Metadata = { title: "Tournaments" };

export default function TournamentsPage() {
  return <TournamentsScreen />;
}
