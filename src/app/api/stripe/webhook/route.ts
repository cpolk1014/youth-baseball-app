import { NextResponse, type NextRequest } from "next/server";
import { getStripe, purchaseFromEvent } from "@/lib/billing/stripe";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * Stripe tells us a checkout was paid; we record it once (codes for a club, a season pass
 * for a team, a parent's player stats). Signed by Stripe (STRIPE_WEBHOOK_SECRET); anything else is refused. A
 * failure returns 500 so Stripe retries.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new NextResponse("Not configured", { status: 400 });

  const payload = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return new NextResponse("Bad signature", { status: 400 });
  }

  try {
    const p = purchaseFromEvent(event);
    if (!p) return NextResponse.json({ received: true });
    if (p.kind === "family") {
      // A parent's player stats, for a year.
      const { error } = await getAdminSupabase().rpc("fulfill_family_purchase", {
        p_session: p.session,
        p_buyer: p.buyer,
        p_kids: p.kids,
        p_athletes: p.athletes,
        p_season: p.season,
        p_amount: p.amountCents,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ received: true });
    }
    const { error } = await getAdminSupabase().rpc("fulfill_purchase", {
      p_session: p.session,
      p_kind: p.kind,
      p_buyer: p.buyer,
      p_club: p.clubId,
      p_club_name: p.clubName,
      p_team: p.teamId,
      p_quantity: p.quantity,
      p_season: p.season,
      p_amount: p.amountCents,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("stripe webhook failed", event.id, e instanceof Error ? e.message : e);
    return new NextResponse("Couldn't record the payment", { status: 500 });
  }
}
