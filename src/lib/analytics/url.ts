// What page views send to Vercel Web Analytics: the page's path with anything private taken
// out. Invite links (/join/…), shared tournaments (/t/…), sign-in codes and club codes in the
// query, and record ids (games, players, tournaments…) never leave; pages are grouped instead
// ("/games/[id]"). Pure: no I/O.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_AFTER = new Set(["join", "t", "auth"]);

/** The URL to report for a page view: same origin, private parts replaced, no query or hash. */
export function analyticsUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.split(/[?#]/)[0] ?? "";
  }
  const parts = u.pathname.split("/");
  const clean = parts.map((part, i) => {
    if (i > 0 && SECRET_AFTER.has(parts[i - 1] ?? "") && part) return "[token]";
    if (UUID.test(part)) return "[id]";
    return part;
  });
  return `${u.origin}${clean.join("/")}`;
}
