import type { Position } from "@/lib/rules/types";

/** Cell colors by position group: battery, infield, outfield, bench. High contrast. */
export function positionClass(position: Position | null): string {
  switch (position) {
    case null:
      return "border-2 border-dashed border-slate-400 bg-white text-slate-400";
    case "BENCH":
      return "bg-slate-300 text-slate-700";
    case "P":
    case "C":
      return "bg-[var(--team)] text-white";
    case "1B":
    case "2B":
    case "3B":
    case "SS":
      return "bg-blue-200 text-blue-950";
    default:
      return "bg-green-200 text-green-950";
  }
}

export function positionLabel(position: Position | null): string {
  if (position === null) return "+";
  return position === "BENCH" ? "—" : position;
}
