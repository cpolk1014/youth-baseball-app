// Venmo handles: what a parent types ("@Polk-Family", "venmo.com/u/Polk-Family") cleaned
// to the username Venmo uses, and the link that opens Venmo to pay them.

/** The username, or null if it can't be one (5–30 letters, numbers, - or _). */
export function cleanVenmo(input: string): string | null {
  const s = input
    .trim()
    .replace(/^https?:\/\/(www\.)?venmo\.com\/(u\/)?/i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9_-]{5,30}$/.test(s) ? s : null;
}

/** Opens Venmo (the app on a phone) to pay this person. */
export function venmoPayUrl(handle: string): string {
  return `https://venmo.com/u/${encodeURIComponent(handle)}`;
}
