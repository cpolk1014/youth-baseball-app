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

/** How long a new cut runs when the parent only marks where it starts. */
export const DEFAULT_CLIP_SECONDS = 8;

/**
 * Moves one end of the cut to where the video is paused ("Start here" / "End here"),
 * keeping it at least a second long and no longer than MAX_CLIP_SECONDS; the other end
 * moves along when it has to. Times are seconds in the video.
 */
export function markClip(
  duration: number,
  cut: { start: number; end: number },
  at: number,
  which: "start" | "end",
): { start: number; end: number } {
  const t = Math.min(Math.max(at, 0), duration);
  const shortest = Math.min(1, duration);
  if (which === "start") {
    const start = Math.min(t, duration - shortest);
    let end = cut.end;
    if (end - start < shortest) end = Math.min(duration, start + DEFAULT_CLIP_SECONDS);
    end = Math.min(end, start + MAX_CLIP_SECONDS);
    return { start, end: Math.max(end, start + shortest) };
  }
  const end = Math.max(t, shortest);
  let start = cut.start;
  if (end - start < shortest) start = Math.max(0, end - DEFAULT_CLIP_SECONDS);
  start = Math.max(start, end - MAX_CLIP_SECONDS);
  return { start: Math.min(start, end - shortest), end };
}

/** Slow-mo lengths a parent can pick (seconds of the clip, played at half speed). */
export const SLOW_LENGTHS = [
  { label: "Quick", seconds: 1.5 },
  { label: "Medium", seconds: 2.5 },
  { label: "Long", seconds: 4 },
] as const;

/** The slow-mo stretch around the big moment, slid over to stay inside the cut. */
export function momentWindow(
  start: number,
  end: number,
  moment: number,
  seconds: number,
): { from: number; to: number } {
  const len = Math.min(Math.max(seconds, MIN_REPLAY_SECONDS), MAX_REPLAY_SECONDS, end - start);
  const from = Math.min(Math.max(moment - len / 2, start), end - len);
  return { from, to: from + len };
}
