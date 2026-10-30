// What the announcer says: "Now batting… number six-seven… Jake Polk!"

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A jersey number in words, the way a PA announcer says it: 24 → "twenty-four". */
export function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) return String(n);
  if (n < 20) return ONES[n]!;
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)]!;
    return n % 10 === 0 ? t : `${t}-${ONES[n % 10]}`;
  }
  // Rare on a jersey; announcers say the digits.
  return String(n)
    .split("")
    .map((d) => ONES[Number(d)])
    .join(" ");
}

export const DEFAULT_SCRIPT = "Now batting... number {number}... {name}!";
/** Without a jersey number the announcer skips it. */
export const DEFAULT_SCRIPT_NO_NUMBER = "Now batting... {name}!";
export const MAX_SCRIPT = 160;
export const MAX_SPOKEN = 60;

export interface CallInput {
  rosterName: string;
  jerseyNumber?: number | null;
  /** How to say them, if the roster spelling or digits come out wrong. */
  nameSpoken?: string;
  numberSpoken?: string;
  script?: string;
}

export function spokenName(input: CallInput): string {
  return input.nameSpoken?.trim() || input.rosterName.trim();
}

export function spokenNumber(input: CallInput): string | null {
  const said = input.numberSpoken?.trim();
  if (said) return said;
  return input.jerseyNumber == null ? null : numberWords(input.jerseyNumber);
}

/** The announcer's words, from the script with {name} and {number} filled in. */
export function announcement(input: CallInput): string {
  const number = spokenNumber(input);
  const script =
    input.script?.trim() || (number === null ? DEFAULT_SCRIPT_NO_NUMBER : DEFAULT_SCRIPT);
  return script
    .replaceAll("{name}", spokenName(input))
    .replaceAll("{number}", number ?? "")
    .replace(/\s+/g, " ")
    .replace(/number\s*\.\.\.\s*\.\.\./i, "...")
    .trim()
    .slice(0, MAX_SCRIPT + MAX_SPOKEN * 2);
}

/** Problems with what someone typed, or null. */
export function scriptProblem(script: string): string | null {
  const s = script.trim();
  if (!s) return null;
  if (s.length > MAX_SCRIPT) return `Keep it under ${MAX_SCRIPT} letters.`;
  if (!s.includes("{name}")) return "Put {name} where the player's name goes.";
  return null;
}
