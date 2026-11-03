import Stripe from "stripe";

// Stripe, server-side only. STRIPE_SECRET_KEY (sk_test_… while testing, sk_live_… for real).

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Payments aren't set up yet (missing STRIPE_SECRET_KEY).");
  if (key.startsWith("pk_")) {
    throw new Error(
      "STRIPE_SECRET_KEY holds the publishable key (pk_…). Use the secret key (sk_test_… or sk_live_…).",
    );
  }
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

/**
 * What to tell the person when Stripe refuses a request: what's wrong with the setup, or
 * Stripe's own reason for a bad request. Never includes any part of a key.
 */
export function stripeProblem(e: unknown): string {
  if (e instanceof Stripe.errors.StripeAuthenticationError) {
    return "Stripe didn't accept the key in STRIPE_SECRET_KEY. Check it's the secret key (sk_test_…) from the same Stripe account, with no extra spaces, then redeploy.";
  }
  if (e instanceof Stripe.errors.StripePermissionError) {
    return "The Stripe key in STRIPE_SECRET_KEY isn't allowed to create checkouts. Use the standard secret key, or give the restricted key Checkout Sessions write access.";
  }
  if (e instanceof Stripe.errors.StripeConnectionError) {
    return "Couldn't reach Stripe. Try again in a minute.";
  }
  if (e instanceof Stripe.errors.StripeInvalidRequestError) {
    return `Stripe refused the checkout: ${e.message.replace(/\b(sk|rk|pk)_(test|live)_[A-Za-z0-9*]+/g, "[key]")}`;
  }
  if (e instanceof Error && e.message.includes("STRIPE_SECRET_KEY")) return e.message;
  return "Couldn't start the payment. Try again.";
}
