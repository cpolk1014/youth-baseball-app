// The public website's building blocks: buttons, sections, device frames, the AI sparkle.
import Link from "next/link";
import type { ReactNode } from "react";

/** Where every "Start your free 14-day trial" goes: sign in (new accounts start a team). */
export const TRIAL_HREF = "/login";
export const CLUB_HREF = "/login?next=/club";

export function Cta({
  href = TRIAL_HREF,
  children = "Start your free 14-day trial",
  variant = "primary",
  size = "lg",
}: {
  href?: string;
  children?: ReactNode;
  variant?: "primary" | "light" | "outline" | "ghost";
  size?: "md" | "lg";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#DC143C]";
  const sizes = size === "lg" ? "h-14 px-7 text-lg" : "h-11 px-5 text-base";
  const variants = {
    primary: "bg-[#DC143C] text-white shadow-lg shadow-[#DC143C]/25 hover:bg-[#B5102F]",
    light: "bg-white text-[#1B2A4A] hover:bg-slate-100",
    outline: "border-2 border-[#1B2A4A] text-[#1B2A4A] hover:bg-[#1B2A4A] hover:text-white",
    ghost: "text-[#1B2A4A] underline-offset-4 hover:underline",
  } as const;
  return (
    <Link href={href} className={`${base} ${sizes} ${variants[variant]}`}>
      {children}
    </Link>
  );
}

export function Section({
  id,
  children,
  tone = "white",
  className = "",
}: {
  id?: string;
  children: ReactNode;
  tone?: "white" | "mist" | "navy";
  className?: string;
}) {
  const tones = {
    white: "bg-white text-slate-900",
    mist: "bg-slate-50 text-slate-900",
    navy: "bg-[#1B2A4A] text-white",
  } as const;
  return (
    <section
      id={id}
      className={`${tones[tone]} scroll-mt-20 px-4 py-16 sm:px-6 md:py-24 ${className}`}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p
      className={`mb-3 text-sm font-bold tracking-[0.14em] uppercase ${light ? "text-[#FF6B85]" : "text-[#DC143C]"}`}
    >
      {children}
    </p>
  );
}

export function H2({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <h2
      className={`text-3xl leading-tight font-black tracking-tight text-balance md:text-5xl ${light ? "text-white" : "text-[#1B2A4A]"}`}
    >
      {children}
    </h2>
  );
}

export function Lead({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p
      className={`mt-4 max-w-2xl text-lg leading-relaxed text-pretty md:text-xl ${light ? "text-white/80" : "text-slate-600"}`}
    >
      {children}
    </p>
  );
}

/** The ✨ that marks every AI feature. */
export function Ai({ children = "AI" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#DC143C] to-[#7C3AED] px-2.5 py-0.5 text-xs font-black tracking-wide text-white uppercase">
      ✨ {children}
    </span>
  );
}

/** A phone around a screenshot (the screenshot is a 375-wide phone capture at 2x). */
export function Phone({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`relative mx-auto w-full max-w-[300px] rounded-[2.6rem] bg-[#0B1220] p-2.5 shadow-2xl shadow-[#1B2A4A]/40 ring-1 ring-black/10 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static screenshots, sized by the frame */}
      <img
        src={src}
        alt={alt}
        width={750}
        height={1624}
        loading={priority ? "eager" : "lazy"}
        className="block aspect-[375/812] w-full rounded-[2rem] object-cover object-top"
      />
    </div>
  );
}

/** A laptop around a screenshot (a 1440-wide capture). */
export function Laptop({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full ${className}`}>
      <div className="rounded-t-2xl bg-[#0B1220] p-2 pb-0 shadow-2xl shadow-[#1B2A4A]/30 sm:p-3 sm:pb-0">
        <div className="mb-2 flex gap-1.5 px-1">
          <span className="size-2.5 rounded-full bg-[#FF5F57]" />
          <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="size-2.5 rounded-full bg-[#28C840]" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- static screenshots */}
        <img
          src={src}
          alt={alt}
          width={1440}
          height={900}
          loading="lazy"
          className="block aspect-[16/10] w-full rounded-t-lg object-cover object-top"
        />
      </div>
      <div className="mx-auto h-3 w-[104%] -translate-x-[2%] rounded-b-2xl bg-gradient-to-b from-slate-300 to-slate-400" />
    </div>
  );
}

export function Check({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-black ${light ? "bg-white/15 text-white" : "bg-[#DC143C]/10 text-[#DC143C]"}`}
      >
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

/** The navy band at the top of every inner page. */
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-[#1B2A4A] px-4 pt-14 pb-16 text-white sm:px-6 md:pt-20 md:pb-24">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 size-[34rem] rounded-full bg-[#DC143C]/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-32 size-[28rem] rounded-full bg-[#7C3AED]/20 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl">
        {eyebrow && <Eyebrow light>{eyebrow}</Eyebrow>}
        <h1 className="max-w-4xl text-4xl leading-[1.05] font-black tracking-tight text-balance md:text-6xl">
          {title}
        </h1>
        {lead && (
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-white/85 md:text-xl">
            {lead}
          </p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

/** Words beside a picture; `flip` puts the picture first on wide screens. */
export function FeatureRow({
  label,
  title,
  children,
  visual,
  flip = false,
}: {
  label?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  visual: ReactNode;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      <div className={flip ? "md:order-2" : ""}>
        {label}
        <h2 className="mt-3 text-3xl leading-tight font-black tracking-tight text-balance text-[#1B2A4A] md:text-4xl">
          {title}
        </h2>
        <div className="mt-4 flex flex-col gap-3 text-lg leading-relaxed text-slate-600">
          {children}
        </div>
      </div>
      <div>{visual}</div>
    </div>
  );
}

/** The closing band on inner pages. */
export function EndCta({
  title = "Let AI run the busywork. You coach the kids.",
  children,
}: {
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-[#1B2A4A] px-4 py-20 text-center text-white sm:px-6">
      <div aria-hidden className="absolute inset-x-0 top-0 h-2 bg-[#DC143C]" />
      <h2 className="mx-auto max-w-3xl text-4xl leading-tight font-black tracking-tight text-balance md:text-5xl">
        {title}
      </h2>
      <div className="mt-8">{children ?? <Cta />}</div>
      <p className="mt-4 text-sm text-white/70">
        14 days of everything, AI included · No credit card
      </p>
    </section>
  );
}
