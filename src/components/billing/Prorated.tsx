// The price of a season bought today and why, in Fungo's bleacher voice. Prices come
// from `quote` / `teamQuote` (src/lib/billing/season.ts), the same ones the checkout charges.
import { dollars, type Quote } from "@/lib/billing/season";

const longDate = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

/** "$89" with the full price struck through when it's less. */
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
export function SeasonNote({ q, per = "" }: { q: Quote; per?: string }) {
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
  } else if (q.spring) {
    text = (
      <>
        <b>Spring pricing.</b> Fall&apos;s in the books, so you pay for the season you&apos;ll play:{" "}
        {dollars(q.cents)}
        {each} instead of {dollars(q.fullCents)}, January through {until}.
      </>
    );
  } else {
    text = (
      <>
        <b>The whole season.</b> Every pitch from now through {until}.
      </>
    );
  }
  return <p className="text-sm text-slate-700">{text}</p>;
}
