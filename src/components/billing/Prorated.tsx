// The price of a season bought today and why, in RallyCap's bleacher voice. Prices come
// from `quote` (src/lib/billing/season.ts), the same one the checkout charges.
import { dollars, type Quote } from "@/lib/billing/season";

const longDate = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

/** "$91" with the full price struck through when it's less. */
export function PriceTag({ cents, fullCents }: { cents: number; fullCents: number }) {
  return (
    <span className="whitespace-nowrap">
      {cents < fullCents && (
        <s className="mr-2 text-base font-semibold text-slate-500" aria-label="instead of">
          {dollars(fullCents)}
        </s>
      )}
      <span className="tabular-nums">{dollars(cents)}</span>
    </span>
  );
}

/** Why the price is what it is today. */
export function ProrateNote({ q, per = "" }: { q: Quote; per?: string }) {
  const each = per ? ` ${per}` : "";
  const until = longDate(q.ends);
  let text: React.ReactNode;
  if (q.bonusDays > 0) {
    text = (
      <>
        <b>Free extra innings.</b> You&apos;re paying for next season, through {until}, and the{" "}
        {q.bonusDays} day{q.bonusDays === 1 ? "" : "s"} left in this one come with it, on the house.
      </>
    );
  } else if (q.daysLeft >= q.seasonDays) {
    text = (
      <>
        <b>Opening day pricing.</b> Every pitch from now through {until}.
      </>
    );
  } else if (q.floor) {
    text = (
      <>
        <b>Bottom of the ninth.</b> Only {q.daysLeft} days are left in the season (it runs August 1
        to July 31). Prorating stops at a quarter of the price, because even the last inning has a
        cover charge. Hold out until June 1 and buying next season throws in the rest of this one
        free.
      </>
    );
  } else {
    text = (
      <>
        <b>Late to the dugout? No problem.</b> The season runs August 1 to July 31, and {q.daysLeft}{" "}
        of its {q.seasonDays} days are left. You pay for those, not the innings you already missed:{" "}
        {dollars(q.cents)}
        {each} instead of {dollars(q.fullCents)}, through {until}.
      </>
    );
  }
  return <p className="text-sm text-slate-700">{text}</p>;
}
