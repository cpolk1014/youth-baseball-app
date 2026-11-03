"use client";

import { useEffect, useState } from "react";

/** Venmo's "V", white, for the pay button. */
export function VenmoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="#fff">
      <path d="M19.5 3.2c.7 1.2 1 2.4 1 3.9 0 4.9-4.2 11.2-7.6 15.6H5.1L2 4.1l6.8-.6 1.7 13.5c1.5-2.5 3.4-6.4 3.4-9.1 0-1.5-.3-2.5-.6-3.3l6.2-1.4z" />
    </svg>
  );
}

/** Which teammates have a Venmo handle (for the Pay button; the handles stay private). */
export function useVenmoUsers(teamId: string | undefined): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!teamId) return;
    let current = true;
    import("@/lib/data/account-backend")
      .then((m) => m.teamVenmoUsers(teamId))
      .then(
        (s) => current && setIds(s),
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [teamId]);
  return ids;
}

/** A Venmo "V" button that pays a teammate (the server looks up their handle). */
export function VenmoButton({
  teamId,
  userId,
  name,
  small = false,
}: {
  teamId: string;
  userId: string;
  name: string;
  small?: boolean;
}) {
  return (
    <a
      href={`/api/venmo?team=${teamId}&user=${userId}`}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Pay ${name} with Venmo`}
      title="Pay with Venmo"
      className={`flex shrink-0 items-center justify-center bg-[#008cff] active:bg-[#0074d4] ${
        small ? "size-8 rounded-lg" : "size-12 rounded-xl"
      }`}
    >
      <VenmoMark className={small ? "size-5" : "size-7"} />
    </a>
  );
}
