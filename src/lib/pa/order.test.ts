import { describe, expect, it } from "vitest";
import { batters, filesFor } from "./order";
import type { Walkup } from "./types";

const players = ["a", "b", "c", "d"].map((id) => ({
  id,
  name: id.toUpperCase(),
  preferredPositions: [],
  canPitch: false,
  canCatch: false,
}));

const walkup = (playerId: string, status: Walkup["status"], announce = true): Walkup => ({
  playerId,
  songPath: `t/walkups/${playerId}/song.wav`,
  songSource: "ai",
  songPrompt: null,
  volume: 1,
  announce,
  announceMode: "over",
  nameSpoken: "",
  numberSpoken: "",
  script: "",
  announcePath: `t/walkups/${playerId}/call.mp3`,
  status,
  updatedAt: "",
});

describe("batters", () => {
  it("follows the batting order and skips kids sitting out or absent", () => {
    const list = batters(
      {
        innings: 6,
        battingOrder: ["c", "a", "b", "d"],
        notBatting: ["b"],
        absent: ["d"],
        slots: [],
      },
      players,
      [walkup("a", "approved"), walkup("c", "pending")],
    );
    expect(list.map((b) => [b.order, b.player.id, b.ready])).toEqual([
      [1, "c", false],
      [2, "a", true],
    ]);
    expect(batters(undefined, players, [])).toEqual([]);
  });

  it("lists the files to keep on the phone (approved walk-ups only)", () => {
    const list = batters({ innings: 6, battingOrder: ["a", "b", "c"], slots: [] }, players, [
      walkup("a", "approved"),
      walkup("b", "pending"),
      walkup("c", "approved", false),
    ]);
    expect(filesFor(list, ["t/sounds/x.mp3"])).toEqual([
      "t/walkups/a/song.wav",
      "t/walkups/a/call.mp3",
      "t/walkups/c/song.wav",
      "t/sounds/x.mp3",
    ]);
  });
});
