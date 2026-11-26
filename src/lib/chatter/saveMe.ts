// "Save me from myself": a person's own setting that asks before every post goes out and says
// plainly who is about to read it. Pure: the words only.
import type { ChatterChannel } from "./feed";

export const SAVE_ME_TITLE = "🛟 Save me from myself";

export const SAVE_ME_PITCH =
  "Ask “Are you sure?” before every post goes out, and show who's about to read it. For thumbs that run faster than the brain. (No judgment. We've all typed something after a 14–2 loss.)";

/** Headlines for the check, picked by the post so the same post always gets the same one. */
const HEADLINES = [
  "Hold your horses 🐴",
  "Timeout, Blue! 🧢",
  "Step out of the box for a sec",
  "Deep breath. Adjust your cap.",
  "Count to ten. Then count the pitches.",
];

const NUDGES = [
  "Read it once more, slowly, like an umpire looking at a close play at the plate.",
  "Would you say this out loud at the snack table, with Coach standing right there?",
  "Is this a post, or a feeling? Feelings can wait for the car ride home.",
  "Picture it read aloud at the end-of-season party. Still good?",
  "Hot takes cool off. Posts don't.",
];

/** For coaches, managers and club admins: their posts go to every family. */
const STAFF_HEADLINES = [
  "Mound visit 🧢",
  "Take a lap, Coach 🏃",
  "Step out of the box for a sec",
  "Deep breath. Adjust your cap.",
  "Count to ten. Then count the pitches.",
];

const STAFF_NUDGES = [
  "Would you say this to a parent's face at pickup?",
  "Picture it read aloud at the end-of-season party. Still good?",
  "Every family reads this. So do the grandparents. They have opinions.",
  "The kids hear about every post at dinner. Make this one worth repeating.",
  "Hot takes cool off. Posts don't.",
];

/** A small, steady number from the words, so a post's check doesn't flicker between renders. */
function seed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** The check's headline and nudge; `staff` (coaches, managers, club admins) get their own. */
export function saveMeLines(body: string, staff = false): { headline: string; nudge: string } {
  const n = seed(body);
  const heads = staff ? STAFF_HEADLINES : HEADLINES;
  const nudges = staff ? STAFF_NUDGES : NUDGES;
  return {
    headline: heads[n % heads.length]!,
    nudge: nudges[Math.floor(n / heads.length) % nudges.length]!,
  };
}

export type Audience = ChatterChannel | "coach";

/** Who reads a post, said so nobody can miss it. */
export function audienceLine(where: Audience, name: string): { label: string; who: string } {
  switch (where) {
    case "families":
      return {
        label: "🤫 Parents channel",
        who: "Just the families. No coaches, no managers. But screenshots exist, and so does the carpool.",
      };
    case "team":
      return {
        label: "🏟️ Club channel",
        who: `Everyone on ${name}, plus the club's director and admins.`,
      };
    case "coach":
      return {
        label: "📋 Coach Chatter",
        who: `Every coach in ${name}, plus the club's director and admins.`,
      };
    default:
      return {
        label: "📣 Team channel",
        who: `Coaches, managers and every family on ${name}. Yes, Coach too.`,
      };
  }
}
