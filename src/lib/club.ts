// Clubs: small shared helpers.

/** The text a director sends a head coach with their team's code (the link fills it in). */
export function codeMessage(club: string, season: string, code: string, origin: string): string {
  return [
    `Here's your team's ${club} code for the ${season} season: ${code}`,
    "",
    `Open this link to add it to your team in RallyCap (sign in first if asked): ${origin}/members?code=${code}`,
    "",
    "Or in RallyCap: menu → Coaches & parents → Club, then enter the code.",
  ].join("\n");
}
