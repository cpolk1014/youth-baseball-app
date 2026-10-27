import { describe, expect, it } from "vitest";
import type { Member, PlayAssignment, QuizResult } from "@/lib/data/types";
import { familiesNotDone, formatDue, homeworkStatus, quizLength } from "./homework";

const assignment: PlayAssignment = {
  id: "a1",
  title: "Bunts",
  playIds: ["bunt-pitcher"],
  dueDate: "2026-11-10",
  createdAt: "2026-11-01T00:00:00Z",
};
const member = (userId: string, role: Member["role"]): Member => ({
  id: `m-${userId}`,
  userId,
  role,
  displayName: userId,
});
const result = (userId: string, correct: number, at: string, assignmentId = "a1"): QuizResult => ({
  id: `${userId}-${at}`,
  assignmentId,
  userId,
  playerId: null,
  correct,
  total: 5,
  completedAt: at,
});
const members = [member("coach", "coach"), member("p1", "parent"), member("p2", "parent")];

describe("homework status", () => {
  it("counts parent families who finished, ignoring coaches and other assignments", () => {
    const s = homeworkStatus(
      assignment,
      [
        result("p1", 3, "1"),
        result("p1", 5, "2"),
        result("coach", 5, "3"),
        result("p2", 5, "4", "a2"),
      ],
      members,
      "p1",
    );
    expect(s.familiesDone).toBe(1);
    expect(s.families).toBe(2);
    expect(s.results).toHaveLength(3);
    expect(s.myBest?.correct).toBe(5);
    expect(familiesNotDone(s, members).map((m) => m.userId)).toEqual(["p2"]);
  });

  it("has no best result before taking it", () => {
    expect(homeworkStatus(assignment, [], members, "p2").myBest).toBeNull();
  });

  it("formats due dates and sizes quizzes", () => {
    expect(formatDue("2026-11-10")).toBe("Due Tue, Nov 10");
    expect(quizLength(1)).toBe(5);
    expect(quizLength(4)).toBe(8);
    expect(quizLength(30)).toBe(10);
  });
});
