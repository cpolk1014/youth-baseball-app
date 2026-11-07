import { describe, expect, it } from "vitest";
import {
  AWARD_PRESETS,
  awardsToPick,
  pickText,
  type TeamAward,
  boardDue,
  cellState,
  liveMessage,
  reminderMessage,
  showList,
  summarizeBoard,
  type BoardRow,
  type ClubAward,
} from "./awards";

const award = (id: string, name: string, sort: number, live = true): ClubAward => ({
  id,
  season: "2026-27",
  name,
  description: null,
  emoji: id === "mvp" ? "🏆" : null,
  sort,
  liveAt: live ? "2026-11-01T00:00:00Z" : null,
  dueOn: live ? "2026-11-20" : null,
});

const row = (
  awardId: string,
  teamId: string,
  player: string | null,
  extra: Partial<BoardRow> = {},
): BoardRow => ({
  awardId,
  teamId,
  teamName: teamId === "t10" ? "Canes" : "Bombers",
  ageGroup: teamId === "t10" ? "10U" : "9U",
  headCoach: teamId === "t10" ? "Coach Polk" : null,
  playerId: player,
  playerName: player ? `Kid ${player}` : null,
  jerseyNumber: player ? 7 : null,
  note: null,
  pickedAt: player ? "2026-11-05T00:00:00Z" : null,
  ...extra,
});

const awards = [
  award("mvp", "Team MVP", 0),
  award("mate", "Best Teammate", 1),
  award("draft", "Draft", 2, false),
];
const rows = [
  row("mvp", "t10", "p1"),
  row("mate", "t10", null),
  row("mvp", "t9", "p2"),
  row("mate", "t9", "p3"),
];

describe("summarizeBoard", () => {
  const s = summarizeBoard(awards, rows);
  it("counts picks by award and by team, live awards only", () => {
    expect(s.live.map((a) => a.id)).toEqual(["mvp", "mate"]);
    expect(s.byAward.map((a) => [a.award.id, a.picked, a.teams])).toEqual([
      ["mvp", 2, 2],
      ["mate", 1, 2],
    ]);
    expect([s.picked, s.total]).toEqual([3, 4]);
  });
  it("orders teams by age group and lists what each still has to pick", () => {
    expect(s.byTeam.map((t) => t.ageGroup)).toEqual(["9U", "10U"]);
    expect(s.teamsToPick.map((t) => [t.teamName, t.missing])).toEqual([
      ["Canes", ["Best Teammate"]],
    ]);
  });
  it("makes the awards show list", () => {
    expect(showList(s).map((x) => [x.award.name, x.winners.map((w) => w.playerName)])).toEqual([
      ["Team MVP", ["Kid p2", "Kid p1"]],
      ["Best Teammate", ["Kid p3"]],
    ]);
  });
});

describe("cells and messages", () => {
  it("knows picked, pending and late", () => {
    expect(cellState({ playerId: "p" }, "2026-11-20", "2026-12-01")).toBe("picked");
    expect(cellState({ playerId: null }, "2026-11-20", "2026-11-20")).toBe("pending");
    expect(cellState({ playerId: null }, "2026-11-20", "2026-11-21")).toBe("late");
  });
  it("writes the live post", () => {
    const text = liveMessage("Traction Canes", awards.slice(0, 2), "2026-11-20");
    expect(text).toContain("🏆 Team MVP\nBest Teammate");
    expect(text).toContain("by Fri, Nov 20");
  });
  it("writes the reminder, naming teams and what's missing", () => {
    const s = summarizeBoard(awards, rows);
    expect(reminderMessage(s, "2026-11-20", "2026-11-18")).toContain(
      "due Fri, Nov 20. Still waiting on:\n• 10U Canes (Coach Polk): Best Teammate",
    );
    expect(reminderMessage(s, "2026-11-20", "2026-11-22")).toMatch(
      /^Award picks were due Fri, Nov 20/,
    );
  });
  it("finds the due date and has distinct presets", () => {
    expect(boardDue(awards)).toBe("2026-11-20");
    expect(new Set(AWARD_PRESETS.map((p) => p.name)).size).toBe(AWARD_PRESETS.length);
  });
});

describe("coach to do", () => {
  const ta = (
    name: string,
    dueOn: string,
    open = true,
    playerId: string | null = null,
  ): TeamAward => ({
    awardId: name,
    clubName: "Canes",
    name,
    description: null,
    emoji: null,
    dueOn,
    open,
    playerId,
    note: null,
    pickedAt: null,
  });
  it("lists open awards with no pick, with the soonest due date", () => {
    const list = awardsToPick([
      ta("Team MVP", "2026-11-20"),
      ta("Best Teammate", "2026-11-18"),
      ta("Hustle", "2026-11-20", true, "p1"),
      ta("Old", "2026-10-01", false),
    ]);
    expect(list.map((a) => a.name)).toEqual(["Team MVP", "Best Teammate"]);
    expect(pickText(list)).toBe(
      "Pick your club awards: Team MVP and Best Teammate (due Wed, Nov 18)",
    );
    expect(pickText([...list, ta("A", "2026-11-20"), ta("B", "2026-11-20")])).toContain(
      "Team MVP, Best Teammate and 2 more",
    );
    expect(pickText([])).toBe("");
  });
});
