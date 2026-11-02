// Does the name printed in a box score belong to this roster player? Box scores print
// "O Polk", "Oliver Polk" or "Polk, O"; rosters hold "Oliver Polk" or "Mason R.".

function parts(name: string): { first: string; last: string | null } {
  let n = name.toLowerCase().replace(/[^a-z, '-]/g, " ");
  // "Polk, O" → "O Polk"
  if (n.includes(",")) {
    const [last, first] = n.split(",", 2) as [string, string];
    n = `${first} ${last}`;
  }
  const words = n.replace(/[,']/g, "").split(/[\s]+/).filter(Boolean);
  return { first: words[0] ?? "", last: words.length > 1 ? words.at(-1)! : null };
}

/** A first name and an initial (or two full names) agree. */
const firstAgrees = (a: string, b: string) =>
  a.length === 1 || b.length === 1 ? a[0] === b[0] : a === b || a[0] === b[0];

/**
 * True when the box score name fits the roster name: same last name (or the roster's last
 * initial) and the same first initial. A roster with only a first name needs it spelled out.
 */
export function namesAgree(rosterName: string, boxName: string | null): boolean {
  if (!boxName) return false;
  const r = parts(rosterName);
  const b = parts(boxName);
  if (!r.first || !b.first) return false;
  // Only a first name on the roster: the box score must spell it out.
  if (!r.last) return b.first === r.first;
  if (!b.last) return false;
  const lastOk = r.last.length === 1 ? b.last[0] === r.last : b.last === r.last;
  return lastOk && firstAgrees(r.first, b.first);
}
