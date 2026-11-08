// The last team's colors, kept on this device so the app opens in them (not RallyCap's
// navy and crimson) before the team's data arrives.
import { themeVars } from "./theme";

export const LOOK_KEY = "rallycap:team-look";

/** Save the open team's color variables (called whenever a team's data is on screen). */
export function rememberLook(colors: string[] | undefined): void {
  try {
    const vars = themeVars(colors);
    const json = JSON.stringify(vars);
    if (window.localStorage.getItem(LOOK_KEY) === json) return;
    window.localStorage.setItem(LOOK_KEY, json);
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  } catch {
    // Private mode or storage off: it just isn't remembered.
  }
}

export function forgetLook(): void {
  try {
    window.localStorage.removeItem(LOOK_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Runs in <head> before the first paint: puts the remembered colors on <html>, where every
 * screen picks them up until its team's data arrives. Only well-formed colors are used.
 */
export const LOOK_SCRIPT = `try{var l=JSON.parse(localStorage.getItem(${JSON.stringify(LOOK_KEY)})||"null");if(l&&typeof l==="object"){for(var k in l){if(/^--team[a-z-]*$/.test(k)&&/^#[0-9a-fA-F]{6}$/.test(l[k]))document.documentElement.style.setProperty(k,l[k])}}}catch(e){}`;
