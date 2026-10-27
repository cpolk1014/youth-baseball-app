import type { Guardian, Member, PlayAssignment, QuizResult } from "@/lib/data/types";

export interface HomeworkStatus {
  /** Parent accounts that have finished at least one quiz on it. */
  familiesDone: number;
  families: number;
  /** All finished quizzes on it that the viewer can see. */
  results: QuizResult[];
  /** The viewer's best result, if they've taken it. */
  myBest: QuizResult | null;
}

export function homeworkStatus(
  assignment: PlayAssignment,
  allResults: QuizResult[],
  members: Member[],
  myUserId: string | null,
): HomeworkStatus {
  const results = allResults
    .filter((r) => r.assignmentId === assignment.id)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const parents = new Set(members.filter((m) => m.role === "parent").map((m) => m.userId));
  const done = new Set(results.map((r) => r.userId).filter((u) => parents.has(u)));
  const mine = results.filter((r) => r.userId === (myUserId ?? "local"));
  const myBest = mine.reduce<QuizResult | null>(
    (best, r) => (!best || r.correct / r.total > best.correct / best.total ? r : best),
    null,
  );
  return { familiesDone: done.size, families: parents.size, results, myBest };
}

/** Parent accounts on the team that haven't finished it yet. */
export function familiesNotDone(status: HomeworkStatus, members: Member[]): Member[] {
  const done = new Set(status.results.map((r) => r.userId));
  return members.filter((m) => m.role === "parent" && !done.has(m.userId));
}

/**
 * Players who have finished it: a result taken for them, or by one of their linked parents
 * without picking a kid.
 */
export function playersDone(
  status: HomeworkStatus,
  playerIds: string[],
  guardians: Guardian[],
): Set<string> {
  const done = new Set<string>();
  for (const r of status.results) {
    if (r.playerId) done.add(r.playerId);
    else for (const g of guardians) if (g.userId === r.userId) done.add(g.playerId);
  }
  return new Set(playerIds.filter((id) => done.has(id)));
}

/** The kid a parent's quiz is for by default: their only linked kid, if exactly one. */
export function defaultKid(myKidIds: string[]): string {
  return myKidIds.length === 1 ? myKidIds[0]! : "";
}

/** "Due Tue, Nov 10" (dates are plain YYYY-MM-DD, no time zone). */
export function formatDue(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `Due ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
}

/** How many questions a homework quiz asks: a couple per play, between 5 and 10. */
export function quizLength(playCount: number): number {
  return Math.min(10, Math.max(5, playCount * 2));
}
