// Tags in Chatter ("@Dana Reyes", "@coaches", "@everyone"): finding what's being typed,
// the suggestions, which tags a post keeps, and splitting a post's words to show them. Pure.

/** Someone (or a group) a post can tag. id: a user id, or "coaches" / "everyone". */
export interface Mentionable {
  id: string;
  /** What goes in the post after the @: "Dana Reyes", "coaches". */
  label: string;
  /** Shown beside the name in the list: "Mason's family", "Coach". */
  hint?: string;
}

/** The @word being typed at the cursor, if any: where it starts and what's typed so far. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([\p{L}\p{N}'.-]{0,30})$/u.exec(before);
  if (!m) return null;
  return { start: caret - m[2]!.length - 1, query: m[2]! };
}

/** Up to five matches, names starting with what's typed first. */
export function filterMentionables(list: Mentionable[], query: string): Mentionable[] {
  const q = query.toLowerCase();
  const starts = list.filter((m) =>
    m.label
      .toLowerCase()
      .split(/\s+/)
      .some((w) => w.startsWith(q)),
  );
  const rest = list.filter((m) => !starts.includes(m) && m.label.toLowerCase().includes(q));
  return [...starts, ...rest].slice(0, 5);
}

/** Put the picked name in place of the @word being typed. Returns the text and new cursor. */
export function insertMention(
  text: string,
  at: { start: number; query: string },
  label: string,
): { text: string; caret: number } {
  const end = at.start + 1 + at.query.length;
  const inserted = `@${label} `;
  return {
    text: text.slice(0, at.start) + inserted + text.slice(end).replace(/^ /, ""),
    caret: at.start + inserted.length,
  };
}

/** The tags still in the words when the post is sent (a name deleted is no longer a tag). */
export function mentionsIn(text: string, picked: Mentionable[]): string[] {
  return [...new Set(picked.filter((m) => text.includes(`@${m.label}`)).map((m) => m.id))];
}

/** A post's words split around its tags, so they can be highlighted. */
export function splitMentions(
  body: string,
  tags: { id: string; label: string }[],
): { text: string; tag?: string }[] {
  const labels = tags.filter((t) => t.label).sort((a, b) => b.label.length - a.label.length);
  if (!labels.length) return [{ text: body }];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@(${labels.map((t) => escape(t.label)).join("|")})`, "g");
  const out: { text: string; tag?: string }[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    if (m.index! > last) out.push({ text: body.slice(last, m.index) });
    out.push({ text: m[0], tag: labels.find((t) => t.label === m[1])!.id });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}
