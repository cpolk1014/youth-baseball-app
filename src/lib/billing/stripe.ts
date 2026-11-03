import Stripe from "stripe";

// Stripe, server-side only. STRIPE_SECRET_KEY (sk_test_… while testing, sk_live_… for real).

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Payments aren't set up yet (missing STRIPE_SECRET_KEY).");
  client ??= new Stripe(key);
  return client;
}

/** What we put on a Checkout session, and read back when Stripe says it was paid. */
export interface PurchaseMeta {
  kind: "club" | "team";
  buyer: string;
  season: string;
  quantity: string;
  clubId?: string;
  clubName?: string;
  teamId?: string;
}

export interface Fulfillment {
  session: string;
  kind: "club" | "team";
  buyer: string;
  clubId: string | null;
  clubName: string | null;
  teamId: string | null;
  quantity: number;
  season: string;
  amountCents: number;
}

/**
 * The purchase to record for a Stripe event, or null when there's nothing to do (other
 * events, or a checkout that isn't paid yet, like a bank transfer still clearing).
 */
export function purchaseFromEvent(event: Stripe.Event): Fulfillment | null {
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return null;
  }
  const s = event.data.object as Stripe.Checkout.Session;
  if (s.payment_status !== "paid") return null;
  const m = (s.metadata ?? {}) as Partial<PurchaseMeta>;
  if ((m.kind !== "club" && m.kind !== "team") || !m.buyer || !m.season) {
    throw new Error(`Checkout ${s.id} is missing RallyCap details.`);
  }
  return {
    session: s.id,
    kind: m.kind,
    buyer: m.buyer,
    clubId: m.clubId || null,
    clubName: m.clubName || null,
    teamId: m.teamId || null,
    quantity: Number(m.quantity) || 1,
    season: m.season,
    amountCents: s.amount_total ?? 0,
  };
}
