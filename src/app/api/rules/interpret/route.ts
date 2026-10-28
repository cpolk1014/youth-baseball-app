import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { interpretationSchema, type Interpretation } from "@/lib/rules/interpret";
import { getServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You turn a youth baseball coach's fair-play rule, typed in plain English, into the rule types a lineup app supports. The app can only follow these types:

- position-min: every player gets at least N innings at a set of positions each game. Use "positions" and "innings".
- position-max: no player gets more than N innings at a set of positions in a game. Use "positions" and "innings".
- never-plays: one player never plays a set of positions. Use "playerName" and "positions".
- locked: one player plays one position in one inning. Use "playerName", "position" and "inning".
- no-repeat-bench: nobody sits the same inning (a number) two games in a row. Use "inning".
- leadoff-rotation: the leadoff hitter changes every game.

Positions: P, C, 1B, 2B, 3B, SS, LF, CF, RF, LCF, RCF. "Infield" is P, C, 1B, 2B, 3B, SS. "Outfield" is LF, CF, RF, LCF, RCF.
Set unused fields to null (or [] for positions). "strict" is true for must-follow wording ("must", "never", "always", "no one") and false for softer wording ("try to", "ideally", "prefer").

Answer with exactly one outcome:
- "rule": the text maps cleanly to one rule. "note" says in one short sentence what you understood.
- "clarify": it's too vague to pick one rule (for example "be fair to everyone"). Ask one short question in "question" and give 2 to 4 short answers in "options", each of which would map to a rule. "rules" is empty.
- "split": it asks for several things. Put each part the app can do in "rules", and say in "note" what part (if any) you left out and why.
- "unsupported": no rule type fits (for example it needs data the app doesn't have, like practice attendance or which games are close). Put the closest rule the app can do in "rules" if there is a reasonable one, else leave it empty, and say in "note" why.

Only use player names from the roster you're given; if the coach names someone not on it, use "clarify" or "unsupported". Never invent a rule type. Keep "note" plain and friendly, written to the coach.`;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** A coach types a rule; Claude says which rule type(s) it is, or asks, or explains. */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(503, "Typed rules aren't set up yet (missing ANTHROPIC_API_KEY).");
  }
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in to add rules.");

  const body = (await request.json().catch(() => null)) as {
    teamId?: unknown;
    text?: unknown;
    answers?: unknown;
  } | null;
  const teamId = typeof body?.teamId === "string" ? body.teamId : null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const answers = Array.isArray(body?.answers)
    ? body.answers.filter((a): a is string => typeof a === "string").slice(0, 5)
    : [];
  if (!teamId || !text) return errorResponse(400, "Type a rule first.");
  if (text.length > 500) return errorResponse(413, "Keep the rule under 500 characters.");

  // Only coaches set fair-play rules; the roster gives Claude players' names to match.
  const [{ data: roles }, { data: team }, { data: players }] = await Promise.all([
    supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
    supabase.from("team").select("coach_pitch").eq("id", teamId).maybeSingle(),
    supabase.from("player").select("id,name").eq("team_id", teamId).eq("active", true),
  ]);
  if (!team || !(roles ?? []).some((r) => r.role === "owner" || r.role === "coach")) {
    return errorResponse(403, "Only coaches set fair-play rules.");
  }
  const names = (players ?? []).map((p) => p.name);
  const context = [
    `Team type: ${team.coach_pitch ? "coach pitch (P is a fielding spot; no pitching rules)" : "kid pitch"}.`,
    `Roster: ${names.join(", ") || "(no players yet)"}.`,
    `Coach's rule: ${text}`,
    ...answers.map((a, i) => `Coach's answer to your question ${i + 1}: ${a}`),
  ].join("\n");

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      // If the request is declined, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: interpretationSchema(names) },
      },
      messages: [{ role: "user", content: context }],
    });
    if (response.stop_reason === "refusal") {
      return errorResponse(422, "That couldn't be turned into a rule. Try wording it differently.");
    }
    if (response.stop_reason === "max_tokens") {
      return errorResponse(422, "That rule is too long. Try a shorter one.");
    }
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text")
      return errorResponse(502, "No answer came back. Try again.");
    const result = JSON.parse(block.text) as Interpretation;
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse(429, "Too many requests right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("rule interpret failed", error.status, error.message);
      return errorResponse(502, "Couldn't check the rule right now. Try again.");
    }
    if (error instanceof SyntaxError) {
      return errorResponse(502, "The answer came back in an unexpected format. Try again.");
    }
    throw error;
  }
}
