import { NextResponse, type NextRequest } from "next/server";
import {
  CLUB_PRICE_CENTS,
  MAX_CLUB_TEAMS,
  TEAM_PRICE_CENTS,
  seasonEnds,
  seasonsOnSale,
} from "@/lib/billing/season";
import { MAX_KIDS, statsPriceCents, validKids } from "@/lib/billing/family";
import { getStripe, stripeProblem, type PurchaseMeta } from "@/lib/billing/stripe";
import { getServerSupabase } from "@/lib/supabase/server";

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Start paying for a season: a club's team codes ($99 each; a new club for a first-time
 * buyer), one team's season ($129), or a family's box score stats (one player or all of
 * theirs; just them, with a partner, or a blended family). Returns Stripe Checkout's URL; nothing is recorded
 * until Stripe confirms the payment (see /api/stripe/webhook).
 */
export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in first.");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = body?.kind;
  // Player stats last a year from the day they're bought; the season is just for the record.
  const season =
    kind === "family"
      ? seasonsOnSale(new Date())[0]!
      : typeof body?.season === "string"
        ? body.season
        : "";
  if (!seasonsOnSale(new Date()).includes(season)) {
    return errorResponse(400, "That season isn't on sale.");
  }
  const meta: PurchaseMeta = { kind: "club", buyer: user.id, season, quantity: "1" };
  let unit: number;
  let quantity = 1;
  let name: string;
  let back: string;

  if (kind === "club") {
    quantity = Number(body?.teams);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CLUB_TEAMS) {
      return errorResponse(400, `Pick between 1 and ${MAX_CLUB_TEAMS} teams.`);
    }
    const clubId = typeof body?.clubId === "string" ? body.clubId : null;
    if (clubId) {
      const { data: admin } = await supabase
        .from("club_admin")
        .select("role")
        .eq("organization_id", clubId)
        .eq("user_id", user.id)
        .maybeSingle();
      const { data: club } = await supabase
        .from("organization")
        .select("name")
        .eq("id", clubId)
        .maybeSingle();
      if (!admin || !club) return errorResponse(403, "Only the club's admins buy its codes.");
      meta.clubId = clubId;
      name = `${club.name}: ${quantity} team${quantity === 1 ? "" : "s"}`;
    } else {
      const clubName = typeof body?.clubName === "string" ? body.clubName.trim().slice(0, 80) : "";
      if (!clubName) return errorResponse(400, "Name your club.");
      meta.clubName = clubName;
      name = `${clubName}: ${quantity} team${quantity === 1 ? "" : "s"}`;
    }
    unit = CLUB_PRICE_CENTS;
    back = "/club";
  } else if (kind === "team") {
    const teamId = typeof body?.teamId === "string" ? body.teamId : "";
    const [{ data: roles }, { data: team }, { data: pass }] = await Promise.all([
      supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
      supabase.from("team").select("name,optioned_at").eq("id", teamId).maybeSingle(),
      supabase
        .from("team_pass")
        .select("season_label")
        .eq("team_id", teamId)
        .eq("season_label", season)
        .maybeSingle(),
    ]);
    const coach = (roles ?? []).some((r) => r.role === "owner" || r.role === "coach");
    if (!coach || !team) return errorResponse(403, "Only the team's coaches pay for its season.");
    if (team.optioned_at) return errorResponse(409, "This team is optioned. Call it up first.");
    if (pass) return errorResponse(409, `This team is already paid for ${season}.`);
    meta.kind = "team";
    meta.teamId = teamId;
    unit = TEAM_PRICE_CENTS;
    name = team.name;
    back = "/members";
  } else if (kind === "family") {
    // Player stats for a number of the parent's own kids ($10, then $5 each), for a year.
    const kids = body?.kids;
    if (!validKids(kids)) return errorResponse(400, `Pick between 1 and ${MAX_KIDS} players.`);
    const { data: mine } = await supabase.rpc("my_athletes");
    const own = new Map(
      ((mine ?? []) as { athlete_id: string; name: string }[]).map((k) => [k.athlete_id, k.name]),
    );
    const picked = Array.isArray(body?.athletes)
      ? [...new Set(body.athletes.filter((a): a is string => typeof a === "string"))]
      : [];
    if (picked.some((a) => !own.has(a))) return errorResponse(403, "Pick your own players.");
    if (picked.length > kids)
      return errorResponse(400, "That's more players than you're paying for.");
    meta.kind = "family";
    meta.kids = String(kids);
    meta.athletes = picked.join(",");
    quantity = 1;
    unit = statsPriceCents(kids);
    name = picked.length
      ? `Player stats: ${picked.map((a) => own.get(a)).join(", ")}`
      : `Player stats for ${kids} player${kids === 1 ? "" : "s"}`;
    back = "/profile";
  } else {
    return errorResponse(400, "Something's missing. Reload and try again.");
  }
  meta.quantity = String(quantity);

  const origin = request.nextUrl.origin;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity,
          price_data: {
            currency: "usd",
            unit_amount: unit,
            product_data: {
              name:
                kind === "family"
                  ? "RallyCap player stats (one year)"
                  : `RallyCap ${season} season${kind === "club" ? " (club team)" : ""}`,
              description: `${name}. Runs through ${new Date(
                kind === "family" ? Date.now() + 365 * 86400000 : `${seasonEnds(season)}T12:00`,
              ).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`,
            },
          },
        },
      ],
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      metadata: { ...meta },
      payment_intent_data: { metadata: { ...meta } },
      success_url: `${origin}${back}${back.includes("?") ? "&" : "?"}paid=1`,
      cancel_url: `${origin}${back}`,
    });
    if (!session.url) return errorResponse(502, "Stripe didn't return a checkout page. Try again.");
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("checkout failed", e instanceof Error ? e.message : e);
    return errorResponse(502, stripeProblem(e));
  }
}
