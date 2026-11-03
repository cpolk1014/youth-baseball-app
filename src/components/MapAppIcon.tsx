// Small app-style icons for "Open in …" (drawn here, in each app's colors).

export function MapAppIcon({ app }: { app: string }) {
  if (app === "Apple Maps") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" className="size-12">
        <rect width="48" height="48" rx="11" fill="#f2f2f7" />
        <path d="M0 30 L48 18 V26 L0 38Z" fill="#fff" />
        <path d="M18 0 H26 L22 48 H14Z" fill="#ffd84d" opacity=".9" />
        <path d="M24 12 L33 34 L24 29 L15 34Z" fill="#007aff" />
      </svg>
    );
  }
  if (app === "Google Maps") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" className="size-12">
        <rect width="48" height="48" rx="11" fill="#fff" />
        <path
          d="M24 6c-7 0-12.5 5.4-12.5 12.3C11.5 27.5 24 42 24 42s12.5-14.5 12.5-23.7C36.5 11.4 31 6 24 6z"
          fill="#ea4335"
        />
        <path
          d="M24 6c-3.6 0-6.8 1.4-9 3.8l9 9.6 9-9.6C30.8 7.4 27.6 6 24 6z"
          fill="#4285f4"
          opacity=".85"
        />
        <circle cx="24" cy="18.5" r="4.6" fill="#fff" />
      </svg>
    );
  }
  if (app === "Bing Maps") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" className="size-12">
        <rect width="48" height="48" rx="11" fill="#fff" />
        <path
          d="M15 8l7 2.5v22.8l9.6-5.6-4.6-2.2-2.9-7.2 15 5.3v7.6L22.1 41 15 37z"
          fill="#008373"
        />
      </svg>
    );
  }
  // Waze
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-12">
      <rect width="48" height="48" rx="11" fill="#33ccff" />
      <path
        d="M24 10c-8 0-14 5.6-14 12.6 0 3 .8 5 2.2 6.6-.4 2.2-1.6 3.6-3.4 4.4 2.6 1 5.4.9 7.8-.4 2.2 1.1 4.8 1.6 7.4 1.6 8 0 14-5.6 14-12.2S32 10 24 10z"
        fill="#fff"
      />
      <circle cx="19.5" cy="21" r="1.7" fill="#222" />
      <circle cx="28.5" cy="21" r="1.7" fill="#222" />
      <path
        d="M18.5 26c1.4 2 3.3 3 5.5 3s4.1-1 5.5-3"
        stroke="#222"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="17" cy="37" r="2.6" fill="#222" />
      <circle cx="30" cy="37" r="2.6" fill="#222" />
    </svg>
  );
}
