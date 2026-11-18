import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { PAID_FEATURE_MESSAGE, teamHasPaid } from "@/lib/billing/paywall";
import { cleanBatting, cleanPitching } from "@/lib/boxscore/stats";
import { matchLines } from "@/lib/boxscore/team";
import { getServerSupabase } from "@/lib/supabase/server";

// Reading a whole team's box score can take a little while.
export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is ~4.5 MB.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_LINES = 30;

const int = { type: "integer" };
const BATTING = [
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
];
const PITCHING = ["h", "r", "er", "bb", "so", "pitches", "strikes", "bf"];
const SCHEMA = {
  type: "object",
  properties: {
    teams: { type: "array", items: { type: "string" } },
    our_team: { type: ["string", "null"] },
    needs_team: { type: "boolean" },
    game_date: { type: ["string", "null"] },
    our_runs: { type: ["integer", "null"] },
    their_runs: { type: ["integer", "null"] },
    players: {
      type: "array",
      items: {
        type: "object",
        properties: {
          box_name: { type: "string" },
          box_number: { type: ["string", "null"] },
          batting: {
            type: "object",
            properties: Object.fromEntries(BATTING.map((k) => [k, int])),
            required: BATTING,
            additionalProperties: false,
          },
          pitching: {
            type: "object",
            properties: {
              pitched: { type: "boolean" },
              ip: { type: "string" },
              ...Object.fromEntries(PITCHING.map((k) => [k, int])),
            },
            required: ["pitched", "ip", ...PITCHING],
            additionalProperties: false,
          },
          errors: int,
          positions: { type: "array", items: { type: "string" } },
        },
        required: ["box_name", "box_number", "batting", "pitching", "errors", "positions"],
        additionalProperties: false,
      },
    },
  },
  required: ["teams", "our_team", "needs_team", "game_date", "our_runs", "their_runs", "players"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You read one youth baseball box score (usually a GameChanger PDF) for a team's coach and report every player on THEIR team. The box score has two teams: a line score, each team's batting lineup (names like "O Polk", sometimes with "#45" and a position like "(P)" or "(2B)"), each team's pitching lines, and short lists under each team such as "2B:", "3B:", "HR:", "TB:", "SB:", "CS:", "HBP:", "SAC:", "SF:", "E:", "P-S:" or "Pitches-Strikes:" (pitches-strikes) and "BF:" (batters faced).

Steps:
1. List the two team names exactly as printed (teams).
2. Decide which team is the coach's (our_team). If the coach chose a team, use it. Otherwise pick the team whose name clearly matches the Fungo team name given, or whose players match the roster given (names and jersey numbers). If you can't tell, set needs_team to true, players to an empty list, and stop.
3. For every player in our team's lineup and every pitcher on our team (a pitcher who didn't bat still gets a line): box_name and box_number as printed (box_number null if not printed); their batting line (AB, R, H, RBI, BB, SO from the lineup table; doubles, triples, HR, SB, CS, HBP, SAC, SF counted from the lists under our team, where "Name 2" means 2 and a name alone means 1); their pitching line if they pitched (ip as printed, like "3.2"; pitches and strikes from the pitches-strikes list, e.g. "Name 77-49"; bf from "BF:"), otherwise pitched false with zeros; their errors from "E:"; the positions shown next to their name.
4. Game details: game_date as YYYY-MM-DD, our team's runs (our_runs) and the other team's (their_runs) from the final score.
Only our team's players. Use 0 for stats not shown and null for game details you can't read. Don't guess.`;

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) || null : null;

/**
 * A coach or manager uploads a game's box score; returns every line for their team, matched
 * to the roster. Nothing is saved here and the file isn't kept: the coach checks it first.
 */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(503, "Box scores aren't set up yet (missing ANTHROPIC_API_KEY).");
  }
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse(401, "Sign in to add a box score.");

  const form = await request.formData();
  const file = form.get("file");
  const gameId = form.get("gameId");
  const chosenTeam = clean(form.get("team"), 80);
  if (!(file instanceof File) || typeof gameId !== "string") {
    return errorResponse(400, "Choose the box score file.");
  }
  if (file.size > MAX_BYTES) return errorResponse(413, "That file is too big. Try one under 4 MB.");

  const { data: game } = await supabase
    .from("game")
    .select("id, opponent, game_date, season:season_id (team_id)")
    .eq("id", gameId)
    .maybeSingle<{
      id: string;
      opponent: string;
      game_date: string;
      season: { team_id: string } | null;
    }>();
  const teamId = game?.season?.team_id;
  if (!game || !teamId) return errorResponse(404, "That game wasn't found.");
  const [{ data: roles }, { data: team }, { data: roster }] = await Promise.all([
    supabase.from("member").select("role").eq("team_id", teamId).eq("user_id", user.id),
    supabase.from("team").select("name").eq("id", teamId).maybeSingle(),
    supabase.from("player").select("id, name, jersey_number").eq("team_id", teamId),
  ]);
  if (!(roles ?? []).some((r) => ["owner", "coach", "manager"].includes(r.role)) || !team) {
    return errorResponse(403, "Only coaches and managers can add box scores.");
  }
  if (!(await teamHasPaid(supabase, teamId))) return errorResponse(402, PAID_FEATURE_MESSAGE);

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

  const kids = (roster ?? []) as { id: string; name: string; jersey_number: number | null }[];
  const ask = [
    `Fungo team name: ${team.name}`,
    `This game: ${game.game_date} against ${game.opponent}`,
    `Roster: ${kids.map((k) => `${k.name}${k.jersey_number === null ? "" : ` #${k.jersey_number}`}`).join("; ")}`,
    chosenTeam ? `The coach says their team in this box score is: ${chosenTeam}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const client = new Anthropic();
  try {
    const response = await client.beta.messages
      .stream({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        // If the request is declined, retry on Anthropic's recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: [source, { type: "text", text: ask }] }],
      })
      .finalMessage();
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
      return NextResponse.json({ status: "pick_team", teams });
    }

    const read = (Array.isArray(raw.players) ? raw.players : [])
      .slice(0, MAX_LINES)
      .map((p) => {
        const r = (p ?? {}) as Record<string, unknown>;
        const pitching = r.pitching as Record<string, unknown> | undefined;
        return {
          boxName: clean(r.box_name, 60),
          boxNumber: clean(r.box_number, 4)?.replace(/[^0-9]/g, "") || null,
          batting: cleanBatting(r.batting),
          pitching: pitching?.pitched === true ? cleanPitching(pitching) : null,
          errors: Math.min(30, Math.max(0, Math.round(Number(r.errors) || 0))),
          positions: (Array.isArray(r.positions) ? r.positions : [])
            .map((x) => clean(x, 4))
            .filter((x): x is string => !!x)
            .slice(0, 12),
        };
      })
      .filter((l) => l.boxName);
    const matched = matchLines(
      read,
      kids.map((k) => ({ id: k.id, name: k.name, jerseyNumber: k.jersey_number })),
    );
    const date = clean(raw.game_date, 10);
    const runs = (v: unknown) =>
      typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 99 ? v : null;
    return NextResponse.json({
      status: "found",
      teams,
      ourTeam,
      opponent: teams.find((t) => t !== ourTeam) ?? null,
      gameDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      ourRuns: runs(raw.our_runs),
      theirRuns: runs(raw.their_runs),
      lines: read.map((l, i) => ({ ...l, ...matched[i]! })),
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
