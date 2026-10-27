import { beforeEach, describe, expect, it } from "vitest";
import { lineupFromGrid } from "@/lib/rules/test-utils";
import { SEED_DATA } from "./seed";
import {
  addPractices,
  deleteAssignment,
  deletePractice,
  getAppData,
  importSchedule,
  recordQuizResult,
  resetLocalData,
  saveAssignment,
  setKidsFor,
  saveGame,
  saveLineup,
  savePractice,
  setCoachPitch,
  setGameStatus,
} from "./store";

// There's no localStorage under Vitest, so the store runs in memory.
const game = SEED_DATA.games[0]!;
const findGame = (id: string) => getAppData().games.find((g) => g.id === id);

describe("store game actions", () => {
  beforeEach(() => resetLocalData());

  it("adds a new game", () => {
    saveGame({ ...game, id: "new-game", opponent: "Eastside" });
    expect(findGame("new-game")?.opponent).toBe("Eastside");
    expect(getAppData().games).toHaveLength(SEED_DATA.games.length + 1);
  });

  it("trims the saved lineup when a game gets shorter", () => {
    saveLineup(game.id, lineupFromGrid({ a: ["P", "P", "C", "C", "SS", "SS"] }));
    saveGame({ ...game, innings: 4 });
    const lineup = getAppData().lineups[game.id];
    expect(findGame(game.id)?.innings).toBe(4);
    expect(lineup?.innings).toBe(4);
    expect(lineup?.slots.map((s) => s.inning)).toEqual([1, 2, 3, 4]);
  });

  it("marks a game final and reopens it", () => {
    setGameStatus(game.id, "final");
    expect(findGame(game.id)?.status).toBe("final");
    setGameStatus(game.id, "scheduled");
    expect(findGame(game.id)?.status).toBe("scheduled");
  });

  it("turns coach's pitch on and off", () => {
    setCoachPitch(true);
    expect(getAppData().team.coachPitch).toBe(true);
    setCoachPitch(false);
    expect(getAppData().team.coachPitch).toBe(false);
  });

  it("keeps players sitting out of batting when saving a lineup", () => {
    saveLineup(game.id, { ...lineupFromGrid({ a: ["P"] }), notBatting: ["b"] });
    expect(getAppData().lineups[game.id]?.notBatting).toEqual(["b"]);
  });

  it("keeps absent players when saving a lineup", () => {
    saveLineup(game.id, { ...lineupFromGrid({ a: ["P"] }), absent: ["c"] });
    expect(getAppData().lineups[game.id]?.absent).toEqual(["c"]);
  });

  it("adds, updates and deletes practices", () => {
    const practice = {
      id: "pr1",
      seasonId: SEED_DATA.season.id,
      date: "2026-11-03",
      startTime: "18:00",
      endTime: "19:30",
      location: "Field 3",
      focus: null,
      notes: null,
      plan: [],
      canceled: false,
      plays: [],
    };
    addPractices([practice, { ...practice, id: "pr2", date: "2026-11-05" }]);
    expect(getAppData().practices).toHaveLength(2);
    savePractice({ ...practice, focus: "Hitting" });
    expect(getAppData().practices.find((p) => p.id === "pr1")?.focus).toBe("Hitting");
    deletePractice("pr2");
    expect(getAppData().practices.map((p) => p.id)).toEqual(["pr1"]);
  });

  it("imports practices and games together, and a retry doesn't duplicate them", async () => {
    const practice = {
      id: "imp-p1",
      seasonId: SEED_DATA.season.id,
      date: "2026-11-16",
      startTime: "17:30",
      endTime: "19:30",
      location: "Chabill's Field",
      focus: null,
      notes: null,
      plan: [],
      canceled: false,
      plays: [],
    };
    const imported = { ...game, id: "imp-g1", date: "2027-02-22", opponent: "TBD" };
    await importSchedule([practice], [imported]);
    await importSchedule([practice], [imported]);
    expect(getAppData().practices.filter((p) => p.id === "imp-p1")).toHaveLength(1);
    expect(getAppData().games.filter((g) => g.id === "imp-g1")).toHaveLength(1);
    expect(getAppData().games).toHaveLength(SEED_DATA.games.length + 1);
  });

  it("assigns plays, records quiz results, and removes both with the assignment", () => {
    const assignment = {
      id: "as1",
      title: "Bunt defense",
      playIds: ["bunt-pitcher", "bunt-catcher"],
      dueDate: "2026-11-10",
      createdAt: "2026-11-01T00:00:00Z",
    };
    saveAssignment(assignment);
    saveAssignment({ ...assignment, title: "Bunts" });
    expect(getAppData().assignments.map((a) => a.title)).toEqual(["Bunts"]);
    recordQuizResult({ assignmentId: "as1", playerId: "a", correct: 4, total: 5 });
    expect(getAppData().quizResults).toMatchObject([{ assignmentId: "as1", correct: 4 }]);
    deleteAssignment("as1");
    expect(getAppData().assignments).toEqual([]);
    expect(getAppData().quizResults).toEqual([]);
  });

  it("links a parent to kids, changing only what changed", async () => {
    await setKidsFor("mom", ["a", "b"]);
    const first = getAppData().guardians;
    expect(first.map((g) => g.playerId)).toEqual(["a", "b"]);
    await setKidsFor("mom", ["b", "c"]);
    const next = getAppData().guardians;
    expect(next.map((g) => g.playerId)).toEqual(["b", "c"]);
    expect(next[0]?.id).toBe(first[1]?.id);
    await setKidsFor("dad", ["a"]);
    expect(getAppData().guardians).toHaveLength(3);
  });
});
