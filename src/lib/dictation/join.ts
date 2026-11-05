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
