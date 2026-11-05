// The family add-on: a kid's box score stats, for a season (Aug 1 - Jul 31). Not part of a
// team pass or club code. Priced by who's covered and how many adults get in.

export type FamilyPlan = "solo" | "partner" | "blended";
export type FamilyScope = "one" | "multi";

export interface FamilyOption {
  plan: FamilyPlan;
  scope: FamilyScope;
  cents: number;
  /** Codes the buyer can share with other adults. */
  shares: number;
  label: string;
  detail: string;
}

const WHO: Record<FamilyPlan, { label: string; shares: number; detail: string }> = {
  solo: { label: "Just me", shares: 0, detail: "For you only." },
  partner: {
    label: "Me and a partner",
    shares: 1,
    detail: "Comes with 1 code to share with another adult.",
  },
  blended: {
    label: "Blended family",
    shares: 3,
    detail: "Comes with 3 codes to share with the other adults.",
  },
};

const PRICES: Record<FamilyScope, Record<FamilyPlan, number>> = {
  one: { solo: 1000, partner: 1500, blended: 3000 },
  multi: { solo: 1500, partner: 2000, blended: 4000 },
};

export const FAMILY_OPTIONS: FamilyOption[] = (["one", "multi"] as const).flatMap((scope) =>
  (["solo", "partner", "blended"] as const).map((plan) => ({
    plan,
    scope,
    cents: PRICES[scope][plan],
    shares: WHO[plan].shares,
    label: WHO[plan].label,
    detail: WHO[plan].detail,
  })),
);

export function familyOption(plan: unknown, scope: unknown): FamilyOption | null {
  return FAMILY_OPTIONS.find((o) => o.plan === plan && o.scope === scope) ?? null;
}

/** The cheapest way in, for "from $10 a season". */
export const FAMILY_FROM_CENTS = Math.min(...FAMILY_OPTIONS.map((o) => o.cents));
