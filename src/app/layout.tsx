import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { LOOK_SCRIPT } from "@/lib/branding/remembered";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "RallyCap", template: "%s · RallyCap" },
  description:
    "Run your youth baseball team: fair lineups, lineup cards, and season playing time.",
  appleWebApp: { capable: true, title: "RallyCap", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1b2a4a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the head script sets the remembered team colors on <html>.
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* The last team's colors, before the first paint (see rememberLook). */}
        <script dangerouslySetInnerHTML={{ __html: LOOK_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
