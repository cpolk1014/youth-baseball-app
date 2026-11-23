import Link from "next/link";
import type { ReactNode } from "react";

export interface EmptyAction {
  label: ReactNode;
  /** A button… */
  onClick?: () => void;
  /** …or a link. */
  href?: string;
}

/**
 * What a section shows before anything is in it: what goes here, why it's worth doing, and
 * the fastest way to start (the first action is the big one). For people who can't add
 * anything (parents), leave out the actions and say who adds it.
 */
export function EmptyState({
  icon,
  title,
  children,
  actions = [],
  className = "",
}: {
  icon: string;
  title: string;
  children: ReactNode;
  actions?: EmptyAction[];
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-white p-5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-3xl leading-none">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <div className="mt-1 text-base text-slate-700">{children}</div>
        </div>
      </div>
      {actions.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {actions.map((a, i) => {
            const look =
              i === 0
                ? "bg-[var(--team)] text-white active:bg-[var(--team-press)]"
                : "border-2 border-slate-300 bg-white text-slate-800 active:bg-slate-100";
            const cls = `flex h-14 items-center justify-center gap-2 rounded-xl px-5 text-lg font-bold sm:flex-1 ${look}`;
            return a.href ? (
              <Link key={i} href={a.href} className={cls}>
                {a.label}
              </Link>
            ) : (
              <button key={i} onClick={a.onClick} className={cls}>
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
