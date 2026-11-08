// Pine Tar Productions: the plays a parent can tag, and the announcer's call for them.
import { numberWords } from "@/lib/pa/speech";

export type PlayId =
  | "hit"
  | "double"
  | "triple"
  | "home_run"
  | "walk_off"
  | "strikeout"
  | "diving_catch"
  | "great_throw"
  | "stolen_base"
  | "double_play";

export interface Play {
  id: PlayId;
  label: string;
  /** Big on the banner. */
  banner: string;
  icon: string;
}

export const PLAYS: Play[] = [
  { id: "hit", label: "Base hit", banner: "BASE HIT", icon: "⚾" },
  { id: "double", label: "Double", banner: "DOUBLE", icon: "✌️" },
  { id: "triple", label: "Triple", banner: "TRIPLE", icon: "🔥" },
  { id: "home_run", label: "Home run", banner: "HOME RUN", icon: "💣" },
  { id: "walk_off", label: "Walk-off", banner: "WALK-OFF", icon: "🎉" },
  { id: "strikeout", label: "Strikeout (pitching)", banner: "STRIKEOUT", icon: "🔥" },
  { id: "diving_catch", label: "Diving catch", banner: "WHAT A CATCH", icon: "🧤" },
  { id: "great_throw", label: "Great throw", banner: "WHAT A THROW", icon: "🎯" },
  { id: "stolen_base", label: "Stolen base", banner: "STOLEN BASE", icon: "💨" },
  { id: "double_play", label: "Double play", banner: "DOUBLE PLAY", icon: "✌️" },
];

export const isPlayId = (v: unknown): v is PlayId => PLAYS.some((p) => p.id === v);
export const playOf = (id: PlayId) => PLAYS.find((p) => p.id === id)!;

export const MAX_CALL = 200;
export const MAX_DETAIL = 140;
/** The clip a reel is made from: long enough for a play, short enough for a phone to render. */
export const MAX_CLIP_SECONDS = 15;

/** First name only, the way an announcer says it. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** A call that works without AI (and the starting point if AI can't help). */
export function fallbackCall(play: PlayId, name: string, number: number | null): string {
  const who =
    number === null ? firstName(name) : `number ${numberWords(number)}... ${firstName(name)}`;
  switch (play) {
    case "home_run":
      return `${who} turns on it... deep to left... that ball is GONE!`;
    case "walk_off":
      return `${who} with the game on the line... base hit... and that's the BALLGAME!`;
    case "strikeout":
      return `${who} deals... swing and a miss! Strike three! Sit down!`;
    case "diving_catch":
      return `Line drive... ${who} lays out... and MAKES THE CATCH!`;
    case "great_throw":
      return `${who} fires... right on the money... OUT at first!`;
    case "stolen_base":
      return `${who} takes off... here's the throw... SAFE! Stolen base!`;
    case "double_play":
      return `Ground ball... ${who} to second... on to first... DOUBLE PLAY!`;
    case "triple":
      return `${who} rips one into the gap... rounding second... in there with a TRIPLE!`;
    case "double":
      return `${who} lines one down the line... and that's a stand-up DOUBLE!`;
    default:
      return `${who} lines a base hit into the outfield! What a swing!`;
  }
}

/** Why the announcer can't say this, or null. */
export function callProblem(text: string): string | null {
  const t = text.trim();
  if (!t) return "Write what the announcer says first.";
  if (t.length > MAX_CALL) return `Keep it under ${MAX_CALL} characters.`;
  if (/https?:|www\.|@/.test(t)) return "Leave links and emails out of the call.";
  return null;
}

/** The longest stretch of the clip that can be slowed down (it plays twice as long). */
export const MAX_REPLAY_SECONDS = 5;
export const MIN_REPLAY_SECONDS = 0.5;
const DEFAULT_REPLAY_SECONDS = 3;

/**
 * The part of the clip the slow-mo replays, kept inside the clip: what the parent picked,
 * or the last 3 seconds. Times are seconds in the original video.
 */
export function replayWindow(
  start: number,
  end: number,
  pick?: { from: number; to: number } | null,
): { from: number; to: number } {
  const clip = Math.max(0, end - start);
  const shortest = Math.min(MIN_REPLAY_SECONDS, clip);
  if (!pick) {
    const len = Math.min(DEFAULT_REPLAY_SECONDS, clip);
    return { from: end - len, to: end };
  }
  const from = Math.min(Math.max(pick.from, start), end - shortest);
  const longest = Math.min(MAX_REPLAY_SECONDS, end - from);
  const len = Math.min(Math.max(pick.to - pick.from, shortest), longest);
  return { from, to: from + len };
}
