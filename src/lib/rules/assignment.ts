/**
 * Minimum-cost assignment (Hungarian algorithm, O(n²m)).
 * `cost[row][col]` with rows ≤ cols. Returns the column assigned to each row.
 */
export function solveAssignment(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const m = cost[0]!.length;
  if (n > m) throw new Error("solveAssignment needs rows <= cols");

  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const match = new Array<number>(m + 1).fill(0); // column → row (1-based), 0 = free
  const way = new Array<number>(m + 1).fill(0);

  for (let row = 1; row <= n; row++) {
    match[0] = row;
    let col0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[col0] = true;
      const row0 = match[col0]!;
      let delta = Infinity;
      let col1 = 0;
      for (let col = 1; col <= m; col++) {
        if (used[col]) continue;
        const cur = cost[row0 - 1]![col - 1]! - u[row0]! - v[col]!;
        if (cur < minv[col]!) {
          minv[col] = cur;
          way[col] = col0;
        }
        if (minv[col]! < delta) {
          delta = minv[col]!;
          col1 = col;
        }
      }
      for (let col = 0; col <= m; col++) {
        if (used[col]) {
          u[match[col]!]! += delta;
          v[col]! -= delta;
        } else {
          minv[col]! -= delta;
        }
      }
      col0 = col1;
    } while (match[col0] !== 0);
    do {
      const col1 = way[col0]!;
      match[col0] = match[col1]!;
      col0 = col1;
    } while (col0 !== 0);
  }

  const result = new Array<number>(n).fill(-1);
  for (let col = 1; col <= m; col++) {
    if (match[col]! > 0) result[match[col]! - 1] = col - 1;
  }
  return result;
}
