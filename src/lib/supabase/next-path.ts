const BASE = "https://fungo.invalid";

/**
 * Only allow same-site paths after sign-in. Browsers drop tabs and newlines from URLs and read
 * "\\" as "/", so "/\t/evil.com" would become "//evil.com": anything with control characters,
 * spaces or backslashes is refused, and what's left must still resolve to this site.
 */
export function safeNextPath(next: string | null | undefined): string {
  const home = "/"; // the start page picks Home or Games for the screen
  if (!next || !next.startsWith("/") || /[\u0000-\u0020\u007f\\]/.test(next)) return home;
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return home;
    return url.pathname + url.search + url.hash;
  } catch {
    return home;
  }
}
