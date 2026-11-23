import type { Metadata } from "next";
import { AdminScreen } from "@/components/admin/AdminScreen";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

/** fungo.team/admin: how the business is doing (Fungo's admins only; the database checks). */
export default function AdminPage() {
  return <AdminScreen />;
}
