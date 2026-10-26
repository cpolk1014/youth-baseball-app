import { beforeEach, describe, expect, it } from "vitest";
import { lineupFromGrid } from "@/lib/rules/test-utils";
import { SEED_DATA } from "./seed";
import {
  addPractices,
  deletePractice,
  getAppData,
  resetLocalData,
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
    };
    addPractices([practice, { ...practice, id: "pr2", date: "2026-11-05" }]);
    expect(getAppData().practices).toHaveLength(2);
    savePractice({ ...practice, focus: "Hitting" });
    expect(getAppData().practices.find((p) => p.id === "pr1")?.focus).toBe("Hitting");
    deletePractice("pr2");
    expect(getAppData().practices.map((p) => p.id)).toEqual(["pr1"]);
  });
});
