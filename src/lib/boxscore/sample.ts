// Made-up stats for the "unlock" preview on My player: three seasons of a player getting
// better, so families can see what the charts look like. Always shown blurred and labeled
// as a sample, never as the kid's own numbers (pure, the same every time).
import type { KidGame } from "./stats";

const OPPONENTS = ["Rays", "Cubs", "Sox", "Bats", "Pirates", "Mets", "Owls", "Hawks"];

/** Three seasons (this year and the two before), 8 games each. */
export function sampleCareer(thisYear: number, playerId = "sample"): KidGame[] {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const games: KidGame[] = [];
  for (let s = 0; s < 3; s++) {
    const year = thisYear - 2 + s;
    for (let i = 0; i < 8; i++) {
      const ab = 3 + Math.floor(rnd() * 2);
      // Hits climb a little each season: about .250, .310, .370.
      const h = Math.min(ab, Math.round(ab * (0.25 + s * 0.06 + (rnd() - 0.5) * 0.25)));
      const doubles = h > 1 && rnd() > 0.6 ? 1 : 0;
      const pitched = i % 3 === 1;
      const pitches = 35 + Math.floor(rnd() * 25);
      games.push({
        id: `sample-${year}-${i}`,
        playerId,
        gameDate: `${year}-${String(3 + Math.floor(i / 2)).padStart(2, "0")}-${String(4 + (i % 2) * 14).padStart(2, "0")}`,
        opponent: OPPONENTS[(i + s) % OPPONENTS.length]!,
        ourRuns: 4 + Math.floor(rnd() * 6),
        theirRuns: 2 + Math.floor(rnd() * 6),
        teamName: null,
        boxName: null,
        batting: {
          ab,
          r: rnd() > 0.5 ? 1 : 0,
          h,
          rbi: h > 0 && rnd() > 0.4 ? 1 : 0,
          bb: rnd() > 0.7 ? 1 : 0,
          so: rnd() > 0.6 ? 1 : 0,
          doubles,
          triples: 0,
          hr: s === 2 && i === 5 ? 1 : 0,
          sb: rnd() > 0.7 ? 1 : 0,
          cs: 0,
          hbp: 0,
          sac: 0,
          sf: 0,
        },
        pitching: pitched
          ? {
              outs: 6 + Math.floor(rnd() * 4),
              h: 1 + Math.floor(rnd() * 3),
              r: Math.floor(rnd() * 3),
              er: Math.floor(rnd() * 2),
              bb: Math.floor(rnd() * 3),
              so: 2 + Math.floor(rnd() * 4),
              pitches,
              strikes: Math.round(pitches * (0.52 + s * 0.04 + rnd() * 0.06)),
              bf: 10 + Math.floor(rnd() * 5),
            }
          : null,
        errors: rnd() > 0.85 ? 1 : 0,
        positions: ["SS"],
      });
    }
  }
  return games;
}
