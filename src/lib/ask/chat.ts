// Ask Fungo's chat rules and answer formatting. Pure: no I/O, no React.
import { ASK_LINKS, SUPPORT_ADDRESS } from "./guide";

/** A visitor's questions a day (all chats), and the questions in one chat. */
export const ASK_PER_VISITOR = 30;
export const ASK_MAX_QUESTIONS = 8;
/** Longest question, and longest earlier answer we send back with the chat. */
export const ASK_MAX_QUESTION = 500;
export const ASK_MAX_ANSWER = 2500;
/** The site's daily spend on Ask Fungo (all visitors), in cents. */
export const ASK_DAY_CENTS = 500;

export const ASK_STARTERS = [
  "How is Fungo different from GameChanger?",
  "What does a club pay?",
  "How do fair lineups work?",
  "Is it safe for kids?",
  "What do parents get?",
];

export const ASK_SITE_LIMIT_TEXT = `Ask Fungo is taking a breather for today. Email ${SUPPORT_ADDRESS} and Craig will answer, or try the [demo club](/demo) in the meantime.`;
export const ASK_VISITOR_LIMIT_TEXT = `That's a lot of questions for one day (we love the enthusiasm). Email ${SUPPORT_ADDRESS} for anything else, or try the [demo club](/demo) to see it for yourself.`;
export const ASK_ERROR_TEXT = `Something went wrong on our end. Try again in a moment, or email ${SUPPORT_ADDRESS}.`;

export interface AskTurn {
  role: "user" | "assistant";
  text: string;
}

/** The chat from the browser, checked: user first and last, turns alternating, sizes capped. */
export function cleanChat(
  input: unknown,
): { ok: true; turns: AskTurn[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0)
    return { ok: false, error: "Ask a question first." };
  const turns: AskTurn[] = [];
  for (const [i, raw] of input.entries()) {
    const t = raw as Partial<AskTurn> | null;
    const role = i % 2 === 0 ? "user" : "assistant";
    if (!t || t.role !== role || typeof t.text !== "string") {
      return { ok: false, error: "That chat got mixed up. Start a new one." };
    }
    const text = t.text.trim();
    if (!text) return { ok: false, error: "Ask a question first." };
    if (role === "user" && text.length > ASK_MAX_QUESTION) {
      return { ok: false, error: `Keep questions under ${ASK_MAX_QUESTION} characters.` };
    }
    turns.push({ role, text: role === "assistant" ? text.slice(0, ASK_MAX_ANSWER) : text });
  }
  if (turns.at(-1)!.role !== "user") return { ok: false, error: "Ask a question first." };
  if (turns.filter((t) => t.role === "user").length > ASK_MAX_QUESTIONS) {
    return { ok: false, error: "This chat is getting long. Start a new one to keep going." };
  }
  return { ok: true, turns };
}

/** A piece of an answer line: words, bold words, or a link to a Fungo page or our email. */
export type AnswerPiece =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string };

export interface AnswerBlock {
  kind: "paragraph" | "list";
  lines: AnswerPiece[][];
}

const EMAILS = [SUPPORT_ADDRESS, "privacy@fungo.team"];

/** Where a link may go: one of our pages, or our email. Anything else stays plain text. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (h in ASK_LINKS) return h;
  const mail = h.replace(/^mailto:/i, "");
  if (EMAILS.includes(mail.toLowerCase())) return `mailto:${mail.toLowerCase()}`;
  return null;
}

/** One line into pieces: [label](href) links (only safe ones), **bold**, and our email address. */
export function linePieces(line: string): AnswerPiece[] {
  const pieces: AnswerPiece[] = [];
  const pattern =
    /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|(support@fungo\.team|privacy@fungo\.team)/gi;
  let last = 0;
  for (const m of line.matchAll(pattern)) {
    if (m.index! > last) pieces.push({ kind: "text", text: line.slice(last, m.index) });
    if (m[1] !== undefined) {
      const href = safeHref(m[2]!);
      pieces.push(href ? { kind: "link", text: m[1], href } : { kind: "text", text: m[1] });
    } else if (m[3] !== undefined) {
      pieces.push({ kind: "bold", text: m[3] });
    } else {
      pieces.push({ kind: "link", text: m[4]!, href: `mailto:${m[4]!.toLowerCase()}` });
    }
    last = m.index! + m[0].length;
  }
  if (last < line.length) pieces.push({ kind: "text", text: line.slice(last) });
  return pieces;
}

/** An answer into paragraphs and bullet lists (the little markdown Ask Fungo writes). */
export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      blocks.push({ kind: "paragraph", lines: [] });
      continue;
    }
    const bullet = /^([-*•]|\d+[.)])\s+(.*)$/.exec(line);
    const kind = bullet ? "list" : "paragraph";
    const content = bullet ? bullet[2]! : line.replace(/^#+\s*/, "");
    const prev = blocks.at(-1);
    if (prev && prev.kind === kind && (kind === "list" || prev.lines.length > 0)) {
      prev.lines.push(linePieces(content));
    } else {
      blocks.push({ kind, lines: [linePieces(content)] });
    }
  }
  return blocks.filter((b) => b.lines.length > 0);
}
