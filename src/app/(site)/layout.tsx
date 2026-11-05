import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.rallycap.team"),
  openGraph: {
    siteName: "RallyCap",
    type: "website",
    images: [
      {
        url: "/site/og.png",
        width: 1200,
        height: 630,
        alt: "RallyCap: youth baseball's AI assistant coach",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
};

/** The public website (rallycap.team for visitors): its own top bar and footer, no app menu. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
