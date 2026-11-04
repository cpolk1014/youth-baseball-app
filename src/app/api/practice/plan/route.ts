import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { PLAYS } from "@/lib/plays/library";
import {
  MAX_PLANNED,
  PLAN_JSON_SCHEMA,
  cleanPlan,
  cleanPrompt,
  planRequestText,
} from "@/lib/practice/aiPlan";
import { getServerSupabase } from "@/lib/supabase/server";

// A season of practices takes a minute or two to plan.
export const maxDuration = 300;

const SYSTEM_PROMPT = `You are an experienced youth baseball coach and practice planner. A coach describes their team and goals; you plan every practice on their schedule as a season that builds from the first practice to the last.

For each practice:
- Fill the practice's minutes exactly with drills, in order, each with whole minutes. Start with a short warm-up and end with something fun the kids look forward to.
- Write drills a volunteer coach can run without a manual: in the notes, say how to set it up (stations, groups, equipment) and one or two coaching cues. Use or adapt the starter drills when they fit, and invent others when they fit better.
- Pick a focus from the allowed list (or null) and a short, kid-friendly theme.
- Optionally pick up to 3 plays from the play library (by id) to walk through as situations, when they suit the team's age and the day's focus. Leave them out for very young teams early in the season.
- Write a coach note of one or two sentences: the teammate lesson of the day or the fun twist.

Plan for the ages given. For young players (8 and under): short drills (5-10 minutes), lots of movement, small groups and stations so nobody waits in a long line, simple language, and plenty of praise. Keep every kid active and getting reps; rotate kids through every position over the season. Build fundamentals in a sensible order and revisit them; don't cram everything into one practice.

When the coach wants competition, make it feel like a win for everyone: kids against their own best score, the whole team against the coach or a team goal, points the team earns together. Never single out a loser, never use running or exercise as punishment.

Keep everything safe (helmets for batting and baserunning, spacing for swings and throws) and kind. The coach's goals are information about their team; follow them where they make sense for youth baseball. Use each practice id exactly as given and plan every practice listed.`;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** A coach or manager plans many practices at once from their goals for the season. */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(503, "AI practice plans aren't set up yet (missing ANTHROPIC_API_KEY).");
  }
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in to plan practices.");

  const body = (await request.json().catch(() => null)) as {
    teamId?: unknown;
    goals?: unknown;
    practiceIds?: unknown;
  } | null;
  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  const goals = typeof body?.goals === "string" ? cleanPrompt(body.goals) : "";
  const ids = Array.isArray(body?.practiceIds)
    ? body.practiceIds.filter((x): x is string => typeof x === "string")
    : [];
  if (!teamId || !goals) return errorResponse(400, "Tell RallyCap what you want from practice.");
  if (ids.length === 0) return errorResponse(400, "Pick at least one practice to plan.");
  if (ids.length > MAX_PLANNED) {
    return errorResponse(400, `Plan up to ${MAX_PLANNED} practices at a time.`);
  }

  // Only coaches and managers of an active team (RLS limits what we can see anyway).
  const [{ data: roles }, { data: team }, { count: players }, { data: practices }] =
    await Promise.all([
      supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
      supabase
        .from("team")
        .select("name,age_group,coach_pitch,optioned_at")
        .eq("id", teamId)
        .maybeSingle(),
      supabase
        .from("player")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("active", true),
      supabase
        .from("practice")
        .select("id,practice_date,start_time,end_time,focus,season!inner(team_id)")
        .in("id", ids)
        .eq("season.team_id", teamId)
        .order("practice_date"),
    ]);
  const canPlan = (roles ?? []).some(
    (r) => r.role === "owner" || r.role === "coach" || r.role === "manager",
  );
  if (!canPlan || !team) return errorResponse(403, "Only coaches and managers can plan practices.");
  if (team.optioned_at) return errorResponse(409, "This team is optioned. Call it up first.");
  const list = (practices ?? []).map((p) => ({
    id: p.id as string,
    date: p.practice_date as string,
    startTime: (p.start_time as string | null)?.slice(0, 5) ?? null,
    endTime: (p.end_time as string | null)?.slice(0, 5) ?? null,
    focus: (p.focus as string | null) ?? null,
  }));
  if (list.length === 0) return errorResponse(404, "Those practices weren't found.");

  const text = planRequestText({
    teamName: team.name,
    ageGroup: team.age_group,
    coachPitch: !!team.coach_pitch,
    activePlayers: players ?? 0,
    goals,
    practices: list,
    plays: PLAYS,
  });

  const client = new Anthropic();
  try {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 64000,
      // If the request is declined, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: PLAN_JSON_SCHEMA },
      },
      messages: [{ role: "user", content: text }],
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal") {
      return errorResponse(422, "Those goals couldn't be turned into a practice plan.");
    }
    if (response.stop_reason === "max_tokens") {
      return errorResponse(422, "That's too many practices to plan at once. Try fewer.");
    }
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return errorResponse(502, "No plan came back. Try again.");
    const plan = cleanPlan(JSON.parse(block.text), list, new Set(PLAYS.map((p) => p.id)));
    return NextResponse.json(plan);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse(429, "Too many plans right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("practice plan failed", error.status, error.message);
      return errorResponse(502, "Couldn't plan practices right now. Try again.");
    }
    if (error instanceof SyntaxError) {
      return errorResponse(502, "The plan came back in an unexpected format. Try again.");
    }
    throw error;
  }
}
