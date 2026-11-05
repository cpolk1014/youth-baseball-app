import Link from "next/link";
import { CLUB_HREF, TRIAL_HREF } from "./parts";

export const SUPPORT_EMAIL = "support@rallycap.team";

/** The public website's footer. */
export function SiteFooter() {
  const col = "flex flex-col gap-2 text-[15px]";
  const head = "mb-1 text-xs font-bold tracking-[0.14em] text-white/50 uppercase";
  const link = "text-white/80 hover:text-white";
  return (
    <footer className="bg-[#0F1A30] px-4 pt-14 pb-10 text-white sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- the logo */}
          <img src="/brand/rallycap-horizontal-white.svg" alt="RallyCap" className="h-14 w-auto" />
          <p className="mt-3 text-lg font-bold">Youth baseball&apos;s AI assistant coach.</p>
          <p className="mt-1 text-white/70">
            Built by a travel ball coach who writes code. For 7U–14U teams.
          </p>
          <Link
            href={TRIAL_HREF}
            className="mt-5 inline-flex h-11 items-center rounded-lg bg-[#DC143C] px-5 font-bold hover:bg-[#B5102F]"
          >
            Start your free 14-day trial
          </Link>
        </div>
        <div className={col}>
          <p className={head}>Product</p>
          <Link className={link} href="/features">
            Features
          </Link>
          <Link className={link} href="/ai">
            AI
          </Link>
          <Link className={link} href="/pricing">
            Pricing
          </Link>
        </div>
        <div className={col}>
          <p className={head}>Who it&apos;s for</p>
          <Link className={link} href="/features">
            Coaches
          </Link>
          <Link className={link} href="/clubs">
            Clubs
          </Link>
          <Link className={link} href={CLUB_HREF}>
            Start a club
          </Link>
          <Link className={link} href="/parents">
            Parents
          </Link>
        </div>
        <div className={col}>
          <p className={head}>Company</p>
          <Link className={link} href="/story">
            Our story
          </Link>
          <a className={link} href={`mailto:${SUPPORT_EMAIL}`}>
            Contact
          </a>
          <Link className={link} href="/privacy">
            Privacy
          </Link>
          <Link className={link} href="/terms">
            Terms
          </Link>
          <Link className={link} href="/login">
            Sign in
          </Link>
        </div>
      </div>
      <p className="mx-auto mt-12 max-w-6xl border-t border-white/10 pt-6 text-sm text-white/50">
        © 2026 RallyCap. Not affiliated with GameChanger, GroupMe or any tournament organization.
      </p>
    </footer>
  );
}
