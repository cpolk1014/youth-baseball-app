import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Fungo.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalPage file="terms-of-service.md" />;
}
