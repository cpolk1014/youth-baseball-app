// A coach's whole-team box score: matching each line to the roster (pure).
import { namesAgree } from "./names";

export interface RosterKid {
  id: string;
  name: string;
  jerseyNumber: number | null;
}

export interface ReadLine {
  boxName: string | null;
  boxNumber: string | null;
}

export interface Matched {
  playerId: string | null;
  /** "number": the number and name agree; "name": the name alone (no number, or it differs). */
  matchedBy: "number" | "name" | null;
}

/**
 * Who each box score line is: the roster kid with that jersey number when the name agrees
 * too, else the one roster kid whose name agrees. A kid is matched at most once; lines left
 * over are for the coach to pick.
 */
export function matchLines(lines: ReadLine[], roster: RosterKid[]): Matched[] {
  const taken = new Set<string>();
  const out: Matched[] = lines.map(() => ({ playerId: null, matchedBy: null }));
  // Numbers first, so a name-only match can't take a kid a number match needs.
  lines.forEach((l, i) => {
    const num = l.boxNumber?.replace(/[^0-9]/g, "") ?? "";
    if (!num) return;
    const kid = roster.find(
      (k) =>
        k.jerseyNumber !== null &&
        String(k.jerseyNumber) === num &&
        !taken.has(k.id) &&
        namesAgree(k.name, l.boxName),
    );
    if (kid) {
      taken.add(kid.id);
      out[i] = { playerId: kid.id, matchedBy: "number" };
    }
  });
  lines.forEach((l, i) => {
    if (out[i]!.playerId) return;
    const fits = roster.filter((k) => !taken.has(k.id) && namesAgree(k.name, l.boxName));
    if (fits.length === 1) {
      taken.add(fits[0]!.id);
      out[i] = { playerId: fits[0]!.id, matchedBy: "name" };
    }
  });
  return out;
}
