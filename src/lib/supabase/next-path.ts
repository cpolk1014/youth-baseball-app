/** Only allow same-site paths after sign-in (no "//evil.com" or absolute URLs). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/"; // the start page picks Home or Games for the screen
  }
  return next;
}
