"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { TRIAL_HREF } from "./parts";

export const SITE_NAV = [
  { href: "/features", label: "Features" },
  { href: "/ai", label: "AI" },
  { href: "/pricing", label: "Pricing" },
  { href: "/clubs", label: "Clubs" },
  { href: "/parents", label: "Parents" },
  { href: "/story", label: "Our story" },
];

/** The public website's top bar: logo and tagline, the pages, Sign in and the trial. */
export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-white/90 backdrop-blur transition ${scrolled ? "border-slate-200 shadow-sm" : "border-transparent"}`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="RallyCap home">
          {/* eslint-disable-next-line @next/next/no-img-element -- the logo */}
          <img src="/brand/rallycap-horizontal-color.svg" alt="RallyCap" className="h-11 w-auto" />
          <span className="hidden text-xs font-bold tracking-wide text-slate-500 uppercase 2xl:inline">
            Youth baseball&apos;s AI assistant coach
          </span>
        </Link>
        <nav aria-label="Site" className="ml-auto hidden items-center gap-1 lg:flex">
          {SITE_NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={path === n.href ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-[15px] font-semibold whitespace-nowrap hover:bg-slate-100 ${path === n.href ? "text-[#DC143C]" : "text-slate-700"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-[15px] font-semibold whitespace-nowrap text-slate-700 hover:bg-slate-100 sm:inline-block"
          >
            Sign in
          </Link>
          <Link
            href={TRIAL_HREF}
            className="inline-flex h-10 items-center rounded-lg bg-[#DC143C] px-4 text-sm font-bold text-white shadow-md shadow-[#DC143C]/25 hover:bg-[#B5102F] sm:h-11 sm:text-base"
          >
            <span className="whitespace-nowrap xl:hidden">Start free trial</span>
            <span className="hidden whitespace-nowrap xl:inline">Start your free 14-day trial</span>
          </Link>
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label="Menu"
            className="flex size-11 items-center justify-center rounded-lg text-2xl text-[#1B2A4A] hover:bg-slate-100 lg:hidden"
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="site-menu"
          aria-label="Site"
          className="border-t border-slate-200 bg-white px-4 pb-4 lg:hidden"
        >
          {SITE_NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="flex h-12 items-center border-b border-slate-100 text-lg font-semibold text-[#1B2A4A]"
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="flex h-12 items-center text-lg font-semibold text-slate-600"
          >
            Sign in
          </Link>
        </nav>
      )}
    </header>
  );
}
