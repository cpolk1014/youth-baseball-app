// Line icons for the wide-screen side rail and search (24×24, drawn with the text color).
const PATHS = {
  home: "M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20",
  games:
    "M8 3v3M16 3v3M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 5Z",
  pa: "M4 10v4h3l5 4V6L7 10H4ZM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11",
  roster:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14a6.5 6.5 0 0 1 3.5 6",
  practice: "M12 3v18M5 7l7-4 7 4M5 7v6l7 4 7-4V7",
  plays: "M5 19 19 5M9 5H5v4M15 19h4v-4M5 5l4 4M15 15l4 4",
  season: "M4 20V10M10 20V4M16 20v-7M21 20H3",
  stats: "M3 20h18M6 16l4-5 4 3 5-7",
  money:
    "M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3S9.5 10.5 12 11s4.5 1.3 4.5 3.5-2 3-4.5 3-4.5-1.3-4.5-3",
  members: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  rules: "M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3ZM8.5 12l2.5 2.5 4.5-5",
  look: "M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1.4-1-1.8-1-3 0-1 .8-1.5 2-1.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3ZM7.5 11.5h.01M10 7.5h.01M15 7.5h.01",
  groupme: "M4 5h16v11H9l-5 4V5ZM8 10h8M8 13h5",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.8-4.8",
  collapse: "M15 6l-6 6 6 6",
  expand: "M9 6l6 6-6 6",
  practiceDay: "M4 19h16M7 19V9l5-4 5 4v10",
  player: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 21a7 7 0 0 1 14 0",
  trophy:
    "M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 21h6M10 17h4v4h-4z",
  medal: "M8 2l4 6 4-6M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
} as const;

export type IconName = keyof typeof PATHS;

export function NavIcon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
