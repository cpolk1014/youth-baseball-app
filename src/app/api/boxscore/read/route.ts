import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { namesAgree } from "@/lib/boxscore/names";
import { cleanBatting, cleanPitching } from "@/lib/boxscore/stats";
import { getServerSupabase } from "@/lib/supabase/server";

// Reading a box score can take a little while.
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is ~4.5 MB.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const int = { type: "integer" };
const SCHEMA = {
  type: "object",
  properties: {
    teams: { type: "array", items: { type: "string" } },
    our_team: { type: ["string", "null"] },
    needs_team: { type: "boolean" },
    found: { type: "boolean" },
    matched_by: { type: "string", enum: ["number", "name", "none"] },
    box_name: { type: ["string", "null"] },
    box_number: { type: ["string", "null"] },
    game_date: { type: ["string", "null"] },
    our_runs: { type: ["integer", "null"] },
    their_runs: { type: ["integer", "null"] },
    batting: {
      type: "object",
      properties: Object.fromEntries(
        [
          "ab",
          "r",
          "h",
          "rbi",
          "bb",
          "so",
          "doubles",
          "triples",
          "hr",
          "sb",
          "cs",
          "hbp",
          "sac",
          "sf",
        ].map((k) => [k, int]),
      ),
      required: [
        "ab",
        "r",
        "h",
        "rbi",
        "bb",
        "so",
        "doubles",
        "triples",
        "hr",
        "sb",
        "cs",
        "hbp",
        "sac",
        "sf",
      ],
      additionalProperties: false,
    },
    pitching: {
      type: "object",
      properties: {
        pitched: { type: "boolean" },
        ip: { type: "string" },
        ...Object.fromEntries(
          ["h", "r", "er", "bb", "so", "pitches", "strikes", "bf"].map((k) => [k, int]),
        ),
      },
      required: ["pitched", "ip", "h", "r", "er", "bb", "so", "pitches", "strikes", "bf"],
      additionalProperties: false,
    },
    errors: int,
    positions: { type: "array", items: { type: "string" } },
  },
  required: [
    "teams",
    "our_team",
    "needs_team",
    "found",
    "matched_by",
    "box_name",
    "box_number",
    "game_date",
    "our_runs",
    "their_runs",
    "batting",
    "pitching",
    "errors",
    "positions",
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You read one youth baseball box score (usually a GameChanger PDF) and report ONE player's numbers for their parent. The box score has two teams: a line score, each team's batting lineup (names like "O Polk", sometimes with "#45" and a position like "(P)" or "(2B)"), each team's pitching lines, and short lists under each team such as "2B:", "3B:", "HR:", "TB:", "SB:", "CS:", "HBP:", "SAC:", "SF:", "E:", "P-S:" (pitches-strikes) and "BF:" (batters faced).

Privacy is critical: these are children. Report only the one player you're asked about. Never put any other player's name or numbers anywhere in your answer.

Steps:
1. List the two team names exactly as printed (teams).
2. Decide which team is the parent's (our_team). If the parent chose a team, use it. Otherwise pick the team whose name clearly matches the RallyCap team name given (shared words like a club name or a coach's last name count). If neither team clearly matches, or the jersey number appears on both teams and you can't tell which is ours, set needs_team to true, found to false, and stop.
3. On our team only, find the player by jersey number (matched_by "number"). If the box score doesn't print numbers for our team, you may match the player's name instead (first initial and last name, matched_by "name"), but only if exactly one player on our team matches. If you can't find them, set found to false and matched_by "none".
4. For that player only: box_name and box_number as printed; their batting line (AB, R, H, RBI, BB, SO from the lineup table; doubles, triples, HR, SB, CS, HBP, SAC, SF counted from the lists under our team, where "Name 2" means 2 and a name alone means 1); their pitching line if they pitched (ip as printed, like "3.2"; pitches and strikes from "P-S: Name 77-49"; bf from "BF:"), otherwise pitched false with zeros; their errors from "E:"; positions shown next to their name.
5. Game details: game_date as YYYY-MM-DD, our team's runs (our_runs) and the other team's (their_runs) from the final score.
Use 0 for stats not shown and null for game details you can't read. Don't guess.`;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) || null : null;

/**
 * A parent uploads a box score; returns only their kid's line (or asks which team is
 * theirs). Nothing is saved here and the file isn't kept: the parent confirms first.
 */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(503, "Box score import isn't set up yet (missing ANTHROPIC_API_KEY).");
  }
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in to import a box score.");

  const form = await request.formData();
  const file = form.get("file");
  const playerId = form.get("playerId");
  const chosenTeam = clean(form.get("team"), 80);
  if (!(file instanceof File) || typeof playerId !== "string") {
    return errorResponse(400, "Choose the box score file.");
  }
  if (file.size > MAX_BYTES) return errorResponse(413, "That file is too big. Try one under 4 MB.");

  // Only the kid's own linked parent (RLS shows families just their own links).
  const { data: link } = await supabase
    .from("player_guardian")
    .select("player_id")
    .eq("player_id", playerId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) return errorResponse(403, "You can only import stats for your own player.");
  const { data: player } = await supabase
    .from("player")
    .select("name, team_id, jersey_number, athlete_id")
    .eq("id", playerId)
    .maybeSingle();
  // Box score stats are a family add-on: no pass for this kid, no reading (and no saving).
  const { data: paid } = player?.athlete_id
    ? await supabase.rpc("family_access", { p_athlete: player.athlete_id })
    : { data: false };
  if (!paid) {
    return errorResponse(402, "Unlock box score stats for this player first.");
  }
  const { data: team } = player
    ? await supabase.from("team").select("name").eq("id", player.team_id).maybeSingle()
    : { data: null };
  if (!player || !team) return errorResponse(404, "That player isn't on a team you're on.");
  // The roster's number only (set by coaches), so a parent can't pull another kid's line.
  if (player.jersey_number === null) {
    return errorResponse(
      409,
      `${player.name} doesn't have a jersey number on the roster yet. Ask a coach to add it.`,
    );
  }
  const number = String(player.jersey_number);

  const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
  let source: Anthropic.Beta.BetaContentBlockParam;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    source = {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: bytes },
    };
  } else if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
    source = {
      type: "image",
      source: { type: "base64", media_type: file.type as ImageType, data: bytes },
    };
  } else {
    return errorResponse(415, "Use the box score PDF from GameChanger (or a screenshot of it).");
  }

  const ask = [
    `RallyCap team name: ${team.name}`,
    `Player: ${player.name}, jersey #${number}`,
    chosenTeam ? `The parent says their player's team in this box score is: ${chosenTeam}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      // If the request is declined, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: [source, { type: "text", text: ask }] }],
    });
    if (response.stop_reason === "refusal") {
      return errorResponse(422, "This file couldn't be read as a box score.");
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return errorResponse(502, "Nothing came back. Try again.");
    const raw = JSON.parse(text.text) as Record<string, unknown>;

    const teams = (Array.isArray(raw.teams) ? raw.teams : [])
      .map((t) => clean(t, 80))
      .filter((t): t is string => !!t)
      .slice(0, 2);
    const ourTeam = clean(raw.our_team, 80);
    if (raw.needs_team === true || !ourTeam) {
      return NextResponse.json({ status: "pick_team", teams, number });
    }

    // A number match must be the number asked for; otherwise it isn't their player.
    const boxNumber = clean(raw.box_number, 4)?.replace(/[^0-9]/g, "") ?? null;
    const byNumber = raw.matched_by === "number";
    if (raw.found !== true || (byNumber && boxNumber !== number) || raw.matched_by === "none") {
      return NextResponse.json({ status: "not_found", teams, ourTeam, number });
    }

    // And the name printed at that spot must be theirs (catches a changed number too).
    const boxName = clean(raw.box_name, 60);
    if (!namesAgree(player.name, boxName)) {
      return NextResponse.json({ status: "mismatch", teams, ourTeam, number });
    }

    const pitchingRaw = raw.pitching as Record<string, unknown> | undefined;
    const date = clean(raw.game_date, 10);
    const runs = (v: unknown) =>
      typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 99 ? v : null;
    return NextResponse.json({
      status: "found",
      teams,
      line: {
        teamName: ourTeam,
        opponent: teams.find((t) => t !== ourTeam) ?? null,
        gameDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
        ourRuns: runs(raw.our_runs),
        theirRuns: runs(raw.their_runs),
        boxName,
        boxNumber,
        matchedBy: byNumber ? "number" : "name",
        batting: cleanBatting(raw.batting),
        pitching: pitchingRaw?.pitched === true ? cleanPitching(pitchingRaw) : null,
        errors: Math.min(30, Math.max(0, Math.round(Number(raw.errors) || 0))),
        positions: (Array.isArray(raw.positions) ? raw.positions : [])
          .map((p) => clean(p, 4))
          .filter((p): p is string => !!p)
          .slice(0, 12),
      },
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse(429, "Too many requests right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("box score read failed", error.status, error.message);
      return errorResponse(502, "Couldn't read the box score right now. Try again.");
    }
    if (error instanceof SyntaxError) {
      return errorResponse(502, "The box score came back in an unexpected format. Try again.");
    }
    throw error;
  }
}
