/**
 * Adds what someone said to what's already in a box: a space between them,
 * a capital letter when it starts a sentence, and no more than `max` characters.
 */
export function joinDictation(base: string, spoken: string, max?: number): string {
  const said = spoken.replace(/\s+/g, " ").trim();
  if (!said) return base;
  const before = base.replace(/\s+$/, "");
  const newLine = /\n$/.test(base);
  const startsSentence = before === "" || newLine || /[.!?]$/.test(before);
  const words = startsSentence ? said.charAt(0).toUpperCase() + said.slice(1) : said;
  const sep = before === "" || newLine ? "" : " ";
  const joined = (newLine ? base : before) + sep + words;
  return max === undefined ? joined : joined.slice(0, max);
}

/**
 * Put what someone said where their cursor was: replacing the text they'd selected (or
 * at the caret), with spaces and a capital letter as needed. Returns the new text and
 * where the cursor goes after the words.
 */
export function insertDictation(
  value: string,
  start: number,
  end: number,
  spoken: string,
  max?: number,
): { text: string; caret: number } {
  const said = spoken.replace(/\s+/g, " ").trim();
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  if (!said) return { text: value, caret: to };
  const head = joinDictation(value.slice(0, from), said);
  const tail = value.slice(to);
  const gap = tail && !/^[\s.,!?;:]/.test(tail) ? " " : "";
  const text = head + gap + tail;
  const limited = max === undefined ? text : text.slice(0, max);
  return { text: limited, caret: Math.min(head.length, limited.length) };
}
