// App screens drawn for the website (the demo team "Bayou Bombers 10U", made-up kids):
// the AI features, which only run signed in to a real team. Same look as the app.
import type { ReactNode } from "react";

const TEAM = "#1B2A4A";
const ACCENT = "#DC143C";

/** A phone with an app screen drawn inside (same frame as the screenshots). */
export function PhoneScreen({
  title,
  subtitle = "Bayou Bombers · 10U",
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`relative mx-auto w-full max-w-[300px] rounded-[2.6rem] bg-[#0B1220] p-2.5 shadow-2xl shadow-[#1B2A4A]/40 ring-1 ring-black/10 ${className}`}
    >
      <div className="flex aspect-[375/812] w-full flex-col overflow-hidden rounded-[2rem] bg-slate-100 text-left">
        <div
          className="flex items-center gap-2 px-3 pt-3 pb-2 text-white"
          style={{ background: TEAM, borderBottom: `4px solid ${ACCENT}` }}
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-[11px] font-black"
            style={{ color: TEAM }}
          >
            BB
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] leading-tight font-bold">{title}</span>
            <span className="block truncate text-[11px] text-white/75">{subtitle}</span>
          </span>
          <span className="text-lg">☰</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3 text-[12px] text-slate-800">
          {children}
        </div>
      </div>
    </div>
  );
}

const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-xl border-2 border-slate-200 bg-white p-2.5 ${className}`}>
    {children}
  </div>
);
const Btn = ({ children, tone = "team" }: { children: ReactNode; tone?: "team" | "green" }) => (
  <div
    className="flex h-10 items-center justify-center rounded-xl text-[13px] font-bold text-white"
    style={{ background: tone === "green" ? "#15803D" : TEAM }}
  >
    {children}
  </div>
);
const Sparkle = ({ children }: { children: ReactNode }) => (
  <div className="rounded-lg bg-gradient-to-r from-[#DC143C] to-[#7C3AED] px-2.5 py-1.5 text-[12px] font-bold text-white">
    ✨ {children}
  </div>
);

/** Snap a schedule: what AI found, to check before adding. */
export function AiScheduleScreen() {
  const games = [
    ["Sat, Mar 7", "9:00 AM", "Gulf Coast Gators", "Oak Villa #6"],
    ["Sat, Mar 7", "1:15 PM", "Lake Charles Sharks", "Oak Villa #7"],
    ["Sun, Mar 8", "10:45 AM", "Acadiana Arsenal", "Parkview Field 2"],
    ["Sat, Mar 14", "11:00 AM", "Northshore Nationals", "Burbank Park 3"],
    ["Sat, Mar 21", "8:30 AM", "Red Stick Rays", "Oak Villa #6"],
  ] as const;
  return (
    <PhoneScreen title="Add games">
      <div className="flex gap-2">
        <div className="grid h-16 w-14 shrink-0 grid-rows-4 gap-0.5 rounded-md bg-white p-1 shadow ring-1 ring-slate-200">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-sm bg-slate-200" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <Sparkle>AI found 12 games</Sparkle>
          <p className="mt-1 text-[11px] text-slate-500">
            From spring-schedule.jpg · check them, then add
          </p>
        </div>
      </div>
      {games.map(([d, t, opp, f]) => (
        <Card key={d + t} className="flex items-center gap-2 py-2">
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-bold text-white"
            style={{ background: TEAM }}
          >
            ✓
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">vs {opp}</span>
            <span className="block truncate text-[11px] text-slate-500">
              {d} · {t} · {f}
            </span>
          </span>
        </Card>
      ))}
      <p className="text-center text-[11px] text-slate-500">+ 7 more</p>
      <div className="mt-auto">
        <Btn tone="green">Add 12 games</Btn>
      </div>
    </PhoneScreen>
  );
}

/** A practice AI planned for the age group. */
export function AiPracticeScreen() {
  const drills = [
    ["10", "Dynamic warm-up & throwing ladder"],
    ["15", "Two-strike approach: choke up, see it deep"],
    ["20", "Cutoffs & relays: hit the cutoff man"],
    ["15", "Situational defense (play: runner on 2nd, single to left)"],
    ["20", "Live BP with counts"],
    ["10", "Base-running relay race"],
  ];
  return (
    <PhoneScreen title="Practice · Tue, Mar 3" subtitle="6:00–7:30 PM · 90 min · Parkview">
      <Sparkle>Planned by AI for 9–10U</Sparkle>
      <Card>
        <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Focus</p>
        <p className="text-[14px] font-bold">Two strikes? Battle!</p>
        <p className="text-[11px] text-slate-600">Theme: “Shrink the zone, grow the fight.”</p>
      </Card>
      {drills.map(([m, d]) => (
        <Card key={d} className="flex items-center gap-2 py-1.5">
          <span
            className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-[11px] font-black text-white"
            style={{ background: TEAM }}
          >
            {m}′
          </span>
          <span className="min-w-0 flex-1 leading-snug">{d}</span>
        </Card>
      ))}
      <p className="text-right text-[11px] font-semibold text-green-700">90 of 90 minutes ✓</p>
    </PhoneScreen>
  );
}

/** Tournament standings and the "what time" answer. */
export function TournamentScreen() {
  const rows = [
    ["1", "Bayou Bombers", "3-0", "29", "6", true],
    ["2", "Gulf Coast Gators", "3-0", "24", "9", false],
    ["T-3", "Red Stick Rays", "2-1", "18", "12", false],
    ["T-3", "Acadiana Arsenal", "2-1", "17", "12", false],
    ["5", "Lake Charles Sharks", "1-2", "11", "19", false],
  ] as const;
  return (
    <PhoneScreen title="Fall Classic" subtitle="Nov 14–15 · Baton Rouge">
      <div
        className="flex h-11 items-center justify-center rounded-xl text-[13px] font-bold text-white"
        style={{ background: TEAM }}
      >
        🕘 What time do we play tomorrow?
      </div>
      <Card className="p-2">
        <p className="mb-1 text-[10px] font-bold tracking-wide text-slate-500 uppercase">
          Standings
        </p>
        {rows.map(([seed, name, wl, rs, ra, us]) => (
          <div
            key={name}
            className={`flex items-center gap-1.5 border-b border-slate-100 py-1 last:border-0 ${us ? "font-bold" : ""}`}
            style={us ? { color: TEAM } : undefined}
          >
            <span className="w-7 tabular-nums">{seed}</span>
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <span className="w-8 text-center tabular-nums">{wl}</span>
            <span className="w-6 text-center tabular-nums">{rs}</span>
            <span className="w-6 text-center tabular-nums">{ra}</span>
          </div>
        ))}
        <p className="mt-1 text-[10px] text-slate-500">Tie broken by fewest runs allowed</p>
      </Card>
      <Card className="border-[#1B2A4A]">
        <p className="text-[14px] font-black">We can finish #1 to #3.</p>
        <p className="mt-1 font-bold">Sun 9:00 AM · Oak Villa #6</p>
        <p className="text-[11px] text-slate-600">as the #1 seed, vs the winner of Game 1</p>
        <p className="mt-1 text-[11px]">
          <b className="text-slate-500">If</b> we beat the Gators by 3 or more runs
        </p>
      </Card>
      <Sparkle>AI read the schedule, bracket & tie-breakers</Sparkle>
    </PhoneScreen>
  );
}

/** A walk-up song with the AI announcer. */
export function WalkupScreen() {
  const bars = [6, 10, 14, 9, 16, 20, 12, 18, 22, 15, 10, 17, 21, 13, 8, 14, 19, 11, 7, 12];
  return (
    <PhoneScreen title="Gameday PA" subtitle="Now batting">
      <Card className="text-center">
        <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">Now batting</p>
        <p className="text-[22px] leading-tight font-black" style={{ color: TEAM }}>
          #7 Mason R.
        </p>
        <p className="text-[11px] text-slate-600">“Bring the Thunder” · Rock · hype</p>
        <div className="mt-2 flex h-10 items-end justify-center gap-[3px]">
          {bars.map((h, i) => (
            <span
              key={i}
              className="w-[6px] rounded-full"
              style={{ height: h * 1.6, background: i < 9 ? ACCENT : "#CBD5E1" }}
            />
          ))}
        </div>
        <div
          className="mx-auto mt-2 flex size-12 items-center justify-center rounded-full text-xl text-white"
          style={{ background: ACCENT }}
        >
          ▶
        </div>
      </Card>
      <Sparkle>AI song, lyrics & announcer</Sparkle>
      <Card>
        <p className="text-[11px] font-bold text-slate-500">🎤 Announcer</p>
        <p className="italic">“Now batting… number seven… MASON R!”</p>
      </Card>
      <Card>
        <p className="text-[11px] font-bold text-slate-500">Next up</p>
        <p className="font-bold">#12 Theo B. · #2 Leo T.</p>
      </Card>
    </PhoneScreen>
  );
}

/** A rule typed in plain English, turned into a lineup rule. */
export function TypedRuleScreen() {
  return (
    <PhoneScreen title="Fair play rules" subtitle="Spring 2027">
      <Card>
        <p className="text-[11px] font-bold text-slate-500">Type a rule</p>
        <p className="mt-1 rounded-lg border-2 border-slate-300 p-2 text-[13px]">
          Mason catches at least two innings every game
        </p>
      </Card>
      <Sparkle>AI turned it into a rule</Sparkle>
      <Card className="border-[#1B2A4A]">
        <p className="text-[13px] font-black">Mason R.: at least 2 innings at C</p>
        <p className="text-[11px] text-slate-600">Every game · Must</p>
        <p className="mt-1 text-[11px] font-semibold text-green-700">
          ✓ Works with your roster and Auto-fill
        </p>
      </Card>
      <div className="mt-1 flex flex-col gap-1.5">
        {[
          ["Max bench innings in a row", "1"],
          ["Nobody sits twice before all sit", "Must"],
          ["Infield innings per game", "1+"],
          ["Pitcher max innings", "2"],
        ].map(([r, v]) => (
          <Card key={r} className="flex items-center justify-between py-1.5">
            <span>{r}</span>
            <b>{v}</b>
          </Card>
        ))}
      </div>
      <div className="mt-auto">
        <Btn tone="green">Add the rule</Btn>
      </div>
    </PhoneScreen>
  );
}

/** A parent's player stats (made-up numbers). */
export function PlayerStatsScreen() {
  const pts = [0.25, 0.31, 0.29, 0.34, 0.33, 0.36, 0.35, 0.38, 0.37, 0.4];
  const w = 230;
  const h = 70;
  const path = pts
    .map((v, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * w},${h - ((v - 0.2) / 0.25) * h}`)
    .join(" ");
  return (
    <PhoneScreen title="Mason R." subtitle="My player · Bayou Bombers">
      <div className="flex flex-wrap gap-1">
        {["All years", "2027", "2026", "2025"].map((y, i) => (
          <span
            key={y}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${i === 1 ? "text-white" : "border border-slate-300 bg-white"}`}
            style={i === 1 ? { background: TEAM } : undefined}
          >
            {y}
          </span>
        ))}
      </div>
      <Card>
        <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
          Mason&apos;s 2027 · 14 games
        </p>
        <div className="mt-1 grid grid-cols-4 gap-1 text-center">
          {[
            [".400", "AVG"],
            [".471", "OBP"],
            [".560", "SLG"],
            ["1.031", "OPS"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-md bg-slate-50 py-1">
              <p className="text-[15px] font-black">{v}</p>
              <p className="text-[9px] font-bold text-slate-500">{l}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
          Season so far
        </p>
        <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 w-full">
          <path d={path} fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
        </svg>
      </Card>
      <Sparkle>AI read the box score: Mason&apos;s line only</Sparkle>
      <Card>
        <p className="font-bold">vs Gulf Coast Gators · W 7–4</p>
        <p className="text-[11px] text-slate-600">2-3, 2B, 2 RBI, R</p>
      </Card>
    </PhoneScreen>
  );
}

/** The club dashboard, on a laptop. */
export function ClubDashboardScreen() {
  const teams = [
    ["Bayou Bombers 10U", "Coach Ramirez", "18-4", "Sat 9:00 AM"],
    ["Bayou Bombers 12U", "Coach Nguyen", "15-6", "Sat 11:30 AM"],
    ["Bayou Bombers 9U", "Coach Davis", "11-7", "Sun 1:00 PM"],
    ["Bayou Bombers 8U", "Coach Patel", "9-9", "Sat 8:00 AM"],
    ["Bayou Bombers 14U", "Coach Brooks", "20-3", "Sat 2:15 PM"],
    ["Bayou Bombers 11U", "Coach Kim", "12-8", "Quiet 2 weeks"],
  ] as const;
  return (
    <div aria-hidden className="mx-auto w-full">
      <div className="rounded-t-2xl bg-[#0B1220] p-2 pb-0 shadow-2xl shadow-[#1B2A4A]/30 sm:p-3 sm:pb-0">
        <div className="mb-2 flex gap-1.5 px-1">
          <span className="size-2.5 rounded-full bg-[#FF5F57]" />
          <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="size-2.5 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex aspect-[16/10] w-full overflow-hidden rounded-t-lg bg-slate-50 text-left text-[11px] sm:text-[12px]">
          <div className="hidden w-36 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-3 sm:flex">
            <p className="mb-2 text-[13px] font-black" style={{ color: TEAM }}>
              Bayou Baseball Club
            </p>
            {["Teams", "Look", "Library", "GroupMe"].map((t, i) => (
              <span
                key={t}
                className={`rounded-md px-2 py-1.5 font-semibold ${i === 0 ? "bg-slate-100" : "text-slate-500"}`}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1 p-3 sm:p-4">
            <p className="text-[15px] font-black sm:text-[18px]" style={{ color: TEAM }}>
              Teams · 2026-27
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
              {teams.map(([n, c, r, nx]) => (
                <div key={n} className="rounded-lg border border-slate-200 bg-white p-2">
                  <p className="truncate font-bold">{n}</p>
                  <p className="truncate text-slate-500">{c}</p>
                  <p className="mt-1 flex justify-between">
                    <b className="tabular-nums">{r}</b>
                    <span
                      className={
                        nx.startsWith("Quiet") ? "font-bold text-amber-600" : "text-slate-600"
                      }
                    >
                      {nx}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto h-3 w-[104%] -translate-x-[2%] rounded-b-2xl bg-gradient-to-b from-slate-300 to-slate-400" />
    </div>
  );
}
