"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { detectPlatform, isPhoneOrTablet } from "@/lib/places/maps";
import { formatPhone, telUrl } from "@/lib/phone/phone";

const noSubscription = () => () => {};

/** Whether this device can place a call (phones and tablets). */
export function useCanCall(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () =>
      isPhoneOrTablet(
        detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
        navigator.userAgent,
      ),
    () => false,
  );
}

/** Someone's cell: a tap-to-call link on phones and tablets, plain text on computers. */
export function Phone({ phone, callable }: { phone: string; callable: boolean }) {
  const shown = formatPhone(phone);
  return callable ? (
    <a
      href={telUrl(phone)}
      onClick={(e) => e.stopPropagation()}
      className="font-semibold whitespace-nowrap text-[var(--team)] underline"
    >
      {shown}
    </a>
  ) : (
    <span className="whitespace-nowrap text-slate-700 tabular-nums">{shown}</span>
  );
}

/** Team members' cell phones (Coaches & parents); empty when signed out. */
export function useTeamPhones(teamId: string | undefined): Map<string, string> {
  const [phones, setPhones] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!teamId) return;
    let current = true;
    import("@/lib/data/account-backend")
      .then((m) => m.teamPhones(teamId))
      .then(
        (p) => current && setPhones(p),
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [teamId]);
  return phones;
}
