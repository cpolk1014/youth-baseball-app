// Where you've been in RallyCap (this browser tab only), for the menu's "Back to …" link.
// A small stack of pages: going to a new page adds it; going back to the page before
// removes the last one, like a browser's history but never leaving the app.

export interface Visit {
  path: string;
  title: string;
}

export const MAX_VISITS = 30;

/** The stack after arriving at `visit`. */
export function visitPage(stack: Visit[], visit: Visit): Visit[] {
  const last = stack.at(-1);
  if (last?.path === visit.path) {
    // Same page (e.g. its title loaded late): keep the better title.
    return [...stack.slice(0, -1), { path: visit.path, title: visit.title || last.title }];
  }
  if (stack.at(-2)?.path === visit.path) return stack.slice(0, -1); // went back
  return [...stack, visit].slice(-MAX_VISITS);
}

/** Where "Back" goes: the page before this one, if there is one. */
export function previousPage(stack: Visit[], currentPath: string): Visit | null {
  const at = stack.at(-1)?.path === currentPath ? stack.length - 2 : stack.length - 1;
  return at >= 0 ? stack[at]! : null;
}

/** "Practice" from the page title "Practice · RallyCap"; a name from the path otherwise. */
export function pageName(title: string, path: string): string {
  const fromTitle = title.replace(/\s*·\s*RallyCap\s*$/, "").trim();
  if (fromTitle && fromTitle !== "RallyCap") return fromTitle;
  const first = path.split(/[/?]/).filter(Boolean)[0] ?? "games";
  return first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, " ");
}
