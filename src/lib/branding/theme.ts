import { DEFAULT_ACCENT, DEFAULT_PRIMARY, inkFor, isHex, pressed, readableOnWhite } from "./color";

/** A team's two colors, falling back to RallyCap's navy and red. */
export function teamColors(colors: string[] | undefined): { main: string; accent: string } {
  const [main, accent] = (colors ?? []).filter(isHex);
  return { main: main ?? DEFAULT_PRIMARY, accent: accent ?? DEFAULT_ACCENT };
}

/**
 * CSS variables for the app's colors. `--team` is the main color made readable with white
 * text (pale colors are darkened), so every bar and button stays legible outdoors.
 */
export function themeVars(colors: string[] | undefined): Record<string, string> {
  const { main, accent } = teamColors(colors);
  const team = readableOnWhite(main);
  return {
    "--team": team,
    "--team-press": pressed(team),
    "--team-accent": accent,
    "--team-accent-ink": inkFor(accent),
  };
}
