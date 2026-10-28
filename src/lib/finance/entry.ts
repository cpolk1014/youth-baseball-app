import { moneySummary, type MoneySummary } from "./ledger";
import { splitCents } from "./money";
import { isSinglePlayer, type FinanceEntry, type FinanceShare } from "./types";

/**
 * Shares for an entry: a Bat Around split across `playerIds` (extra pennies to the last
 * ones), a one-player type all to `playerIds[0]`, and none for team-only types.
 */
export function sharesFor(
  entry: Pick<FinanceEntry, "id" | "type" | "amountCents">,
  playerIds: readonly string[],
  makeId: () => string,
): FinanceShare[] {
  if (entry.type === "bat_around") {
    return splitCents(entry.amountCents, playerIds.length).map((amountCents, i) => ({
      id: makeId(),
      entryId: entry.id,
      playerId: playerIds[i]!,
      amountCents,
    }));
  }
  if (isSinglePlayer(entry.type) && playerIds[0]) {
    return [
      { id: makeId(), entryId: entry.id, playerId: playerIds[0], amountCents: entry.amountCents },
    ];
  }
  return [];
}

/** "$100.00 each", or "$730.18–$730.19 each" when the split isn't even. */
export function eachLabel(
  amountCents: number,
  players: number,
  format: (c: number) => string,
): string {
  const parts = splitCents(amountCents, players);
  if (parts.length === 0) return "";
  const lo = parts[0]!;
  const hi = parts[parts.length - 1]!;
  return lo === hi ? `${format(lo)} each` : `${format(lo)}–${format(hi)} each`;
}

/**
 * The totals to show: computed from every entry for coaches and treasurers (always
 * current), otherwise the server's summary (they can't see every entry).
 */
export function summaryToShow(
  entries: readonly FinanceEntry[],
  serverSummary: MoneySummary | null,
  seesAll: boolean,
): MoneySummary {
  return seesAll || !serverSummary ? moneySummary(entries) : serverSummary;
}
