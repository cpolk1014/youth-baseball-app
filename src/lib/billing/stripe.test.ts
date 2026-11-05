import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { keyShape, purchaseFromEvent, stripeProblem } from "./stripe";

const stripe = new Stripe("sk_test_dummy");
const SECRET = "whsec_test_secret";

function signedEvent(type: string, session: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: "evt_1",
    object: "event",
    type,
    data: { object: { id: "cs_test_1", object: "checkout.session", ...session } },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return stripe.webhooks.constructEvent(payload, header, SECRET);
}

const clubMeta = {
  kind: "club",
  buyer: "user-1",
  season: "2026-27",
  quantity: "26",
  clubName: "Traction Canes",
};

describe("Stripe payment notices", () => {
  it("records a paid club checkout", () => {
    const e = signedEvent("checkout.session.completed", {
      payment_status: "paid",
      amount_total: 257400,
      metadata: clubMeta,
    });
    expect(purchaseFromEvent(e)).toEqual({
      session: "cs_test_1",
      kind: "club",
      buyer: "user-1",
      clubId: null,
      clubName: "Traction Canes",
      teamId: null,
      quantity: 26,
      season: "2026-27",
      amountCents: 257400,
      plan: null,
      scope: null,
      athleteId: null,
    });
  });

  it("records a family's stats pass", () => {
    const e = signedEvent("checkout.session.completed", {
      payment_status: "paid",
      amount_total: 3000,
      metadata: {
        kind: "family",
        buyer: "u2",
        season: "2026-27",
        quantity: "1",
        plan: "blended",
        scope: "one",
        athleteId: "a1",
      },
    });
    expect(purchaseFromEvent(e)).toMatchObject({
      kind: "family",
      plan: "blended",
      scope: "one",
      athleteId: "a1",
      amountCents: 3000,
    });
  });

  it("waits for a payment that hasn't cleared, and ignores other events", () => {
    const pending = signedEvent("checkout.session.completed", {
      payment_status: "unpaid",
      metadata: clubMeta,
    });
    expect(purchaseFromEvent(pending)).toBeNull();
    const later = signedEvent("checkout.session.async_payment_succeeded", {
      payment_status: "paid",
      amount_total: 12900,
      metadata: { kind: "team", buyer: "u", season: "2026-27", quantity: "1", teamId: "t1" },
    });
    expect(purchaseFromEvent(later)).toMatchObject({
      kind: "team",
      teamId: "t1",
      amountCents: 12900,
    });
    expect(purchaseFromEvent(signedEvent("customer.created", {}))).toBeNull();
  });

  it("refuses a notice with a bad signature", () => {
    const payload = JSON.stringify({
      id: "evt_x",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
    expect(() => stripe.webhooks.constructEvent(payload, header, SECRET)).toThrow();
  });

  it("complains about a paid checkout without RallyCap details", () => {
    const e = signedEvent("checkout.session.completed", { payment_status: "paid", metadata: {} });
    expect(() => purchaseFromEvent(e)).toThrow(/missing RallyCap details/);
  });
});

describe("stripeProblem", () => {
  it("says what's wrong with the setup, never showing a key", () => {
    const auth = new Stripe.errors.StripeAuthenticationError({
      message: "Invalid API Key provided: sk_test_****abcd",
      type: "invalid_request_error",
    });
    expect(stripeProblem(auth)).toMatch(/doesn't recognize it/);
    expect(stripeProblem(auth)).not.toMatch(/abcd/);
    const bad = new Stripe.errors.StripeInvalidRequestError({
      message: "No such price for key sk_test_abc123",
      type: "invalid_request_error",
    });
    expect(stripeProblem(bad)).toBe("Stripe refused the checkout: No such price for key [key]");
    expect(stripeProblem(new Error("boom"))).toBe("Couldn't start the payment. Try again.");
  });
});

describe("keyShape", () => {
  it("describes a key without showing it", () => {
    expect(keyShape("sk_test_abcdef")).toBe("sk_test_…, 14 characters");
    expect(keyShape(' "sk_live_abc" ')).toBe(
      "an unknown kind of key…, 15 characters, spaces at the start or end, quote marks in it",
    );
    expect(keyShape(undefined)).toBe("none");
  });
});
