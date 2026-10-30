"use client";

import { logoUrl } from "@/lib/branding/logo";
import { teamColors } from "@/lib/branding/theme";

/**
 * A team's logo, or (without one) its initials on its colors. Square, rounded, any size.
 */
export function TeamBadge({
  name,
  colors,
  logoPath,
  size = 40,
}: {
  name: string;
  colors?: string[];
  logoPath?: string | null;
  size?: number;
}) {
  const url = logoUrl(logoPath);
  const { main, accent } = teamColors(colors);
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small, already-sized team logo
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-lg bg-white object-contain p-0.5"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-lg font-black"
      style={{
        width: size,
        height: size,
        background: main,
        color: "#fff",
        boxShadow: `inset 0 -${Math.max(3, size / 10)}px 0 ${accent}`,
        fontSize: size * 0.4,
      }}
    >
      {initials || "⚾"}
    </span>
  );
}
