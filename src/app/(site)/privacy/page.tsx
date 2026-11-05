import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How RallyCap collects, uses and protects information about coaches, parents and players.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage file="privacy-policy.md" />;
}
