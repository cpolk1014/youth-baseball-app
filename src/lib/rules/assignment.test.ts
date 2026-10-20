import { describe, expect, it } from "vitest";
import { solveAssignment } from "./assignment";

describe("solveAssignment", () => {
  it("finds the minimum-cost matching", () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    // Best: row0→col1 (1), row1→col0 (2), row2→col2 (2) = 5
    expect(solveAssignment(cost)).toEqual([1, 0, 2]);
  });

  it("handles more columns than rows", () => {
    expect(solveAssignment([[5, 1, 9]])).toEqual([1]);
  });

  it("handles empty input and rejects more rows than columns", () => {
    expect(solveAssignment([])).toEqual([]);
    expect(() => solveAssignment([[1], [2]])).toThrow();
  });
});
