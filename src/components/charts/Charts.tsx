"use client";

// Small hand-drawn charts (no chart library). Colors come from the validated palette:
// blue / aqua / orange for series, blue <-> red for won/lost, gray for "nothing".
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GameRuns, MoneyPoint, PlayingTimeBar } from "@/lib/charts";
import { formatCents, shortDate } from "@/lib/finance/money";

const BLUE = "#2a78d6";
const AQUA = "#1baf7a";
const ORANGE = "#eb6834";
const RED = "#e34948";
const GRAY = "#c9c7c1";
const GRID = "#e8e6e1";

/** Width of an element, kept current as it resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={i.line ? "h-0.5 w-4 rounded-full" : "size-3 rounded-sm"}
            style={{ background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 w-max max-w-56 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg"
      style={{ left: x, top: y - 8 }}
    >
      {children}
    </div>
  );
}

/** Each kid's season innings as one bar: infield, outfield, bench. */
export function PlayingTimeChart({ bars }: { bars: PlayingTimeBar[] }) {
  const [hover, setHover] = useState<{ bar: PlayingTimeBar; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...bars.map((b) => b.total));
  const parts = (b: PlayingTimeBar) =>
    [
      { key: "infield", n: b.infield, color: BLUE },
      { key: "outfield", n: b.outfield, color: AQUA },
      { key: "bench", n: b.bench, color: GRAY },
    ].filter((p) => p.n > 0);
  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold tracking-wide text-slate-500 uppercase">
          Innings by player
        </span>
        <Legend
          items={[
            { label: "Infield", color: BLUE },
            { label: "Outfield", color: AQUA },
            { label: "Bench", color: GRAY },
          ]}
        />
      </figcaption>
      <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
        <ul className="flex flex-col gap-1.5">
          {bars.map((b) => (
            <li
              key={b.playerId}
              className="flex items-center gap-2 text-sm"
              onMouseMove={(e) => {
                const r = box.current!.getBoundingClientRect();
                setHover({ bar: b, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              aria-label={`${b.name}: ${b.infield} infield, ${b.outfield} outfield, ${b.bench} bench innings`}
            >
              <span className="w-24 shrink-0 truncate font-semibold text-slate-700">
                {b.flagged && (
                  <span className="text-amber-600" title="Short on infield or sits a lot">
                    ●{" "}
                  </span>
                )}
                {b.name}
              </span>
              <span className="flex h-5 flex-1 items-center">
                <span
                  className="flex h-full gap-[2px]"
                  style={{ width: `${(b.total / max) * 100}%` }}
                >
                  {parts(b).map((p, i, all) => (
                    <span
                      key={p.key}
                      className={`h-full ${i === all.length - 1 ? "rounded-r" : ""} ${i === 0 ? "rounded-l-sm" : ""}`}
                      style={{ flexGrow: p.n, flexBasis: 0, background: p.color }}
                    />
                  ))}
                </span>
              </span>
              <span className="w-8 shrink-0 text-right text-slate-500 tabular-nums">{b.total}</span>
            </li>
          ))}
        </ul>
        {hover && (
          <Tooltip x={hover.x} y={hover.y}>
            <p className="font-bold">{hover.bar.name}</p>
            <p>
              {hover.bar.infield} infield · {hover.bar.outfield} outfield · {hover.bar.bench} bench
            </p>
            {hover.bar.total > 0 && (
              <p className="text-white/70">
                Sits {Math.round((hover.bar.bench / hover.bar.total) * 100)}% of innings
              </p>
            )}
          </Tooltip>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Number at the end: total innings. ● short on infield or sits more than most.
      </p>
    </figure>
  );
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/** Money in and money out over the season, as running totals. */
export function MoneyChart({ points, year }: { points: MoneyPoint[]; year: number }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [at, setAt] = useState<number | null>(null);
  const H = 200;
  const pad = { l: 56, r: 16, t: 12, b: 26 };
  const w = Math.max(0, width - pad.l - pad.r);
  const h = H - pad.t - pad.b;
  const t = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const t0 = points.length ? t(points[0]!.date) : 0;
  const t1 = points.length ? Math.max(t(points.at(-1)!.date), t0 + 86400000) : 1;
  const top = Math.max(1, ...points.map((p) => Math.max(p.inCents, p.outCents)));
  // Round the top to a tidy number of dollars for the grid.
  const step = niceStep(top / 3);
  const yMax = Math.ceil(top / step) * step;
  const x = (d: string) => pad.l + ((t(d) - t0) / (t1 - t0)) * w;
  const y = (c: number) => pad.t + h - (Math.max(0, c) / yMax) * h;
  const path = (key: "inCents" | "outCents") =>
    // A step line: each total holds until the next day money moved.
    points
      .map((p, i) => (i === 0 ? `M${x(p.date)},${y(p[key])}` : `H${x(p.date)}V${y(p[key])}`))
      .join("") + `H${pad.l + w}`;
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const p = at === null ? null : points[at]!;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left + pad.l;
    let best = 0;
    for (let i = 0; i < points.length; i++) {
      if (Math.abs(x(points[i]!.date) - px) < Math.abs(x(points[best]!.date) - px)) best = i;
    }
    setAt(best);
  };

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold tracking-wide text-slate-500 uppercase">
          Money over the season
        </span>
        <Legend
          items={[
            { label: "Money in", color: BLUE, line: true },
            { label: "Money out", color: ORANGE, line: true },
          ]}
        />
      </figcaption>
      <div ref={ref} className="relative">
        {width > 0 && points.length > 0 && (
          <svg width={width} height={H} role="img" aria-label="Money in and out over the season">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={pad.l + w} y1={y(v)} y2={y(v)} stroke={GRID} />
                <text
                  x={pad.l - 8}
                  y={y(v) + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[11px]"
                >
                  {money(v)}
                </text>
              </g>
            ))}
            <text x={pad.l} y={H - 6} className="fill-slate-500 text-[11px]">
              {shortDate(points[0]!.date, year)}
            </text>
            <text x={pad.l + w} y={H - 6} textAnchor="end" className="fill-slate-500 text-[11px]">
              {shortDate(points.at(-1)!.date, year)}
            </text>
            <path d={path("outCents")} fill="none" stroke={ORANGE} strokeWidth={2} />
            <path d={path("inCents")} fill="none" stroke={BLUE} strokeWidth={2} />
            {p && (
              <g>
                <line
                  x1={x(p.date)}
                  x2={x(p.date)}
                  y1={pad.t}
                  y2={pad.t + h}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                />
                {(
                  [
                    ["outCents", ORANGE],
                    ["inCents", BLUE],
                  ] as const
                ).map(([k, c]) => (
                  <circle
                    key={k}
                    cx={x(p.date)}
                    cy={y(p[k])}
                    r={5}
                    fill={c}
                    stroke="white"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}
            <rect
              x={pad.l}
              y={pad.t}
              width={w}
              height={h}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setAt(null)}
            />
          </svg>
        )}
        {p && (
          <Tooltip x={x(p.date)} y={Math.min(y(p.inCents), y(p.outCents))}>
            <p className="font-bold">{shortDate(p.date, year)}</p>
            <p>In so far: {formatCents(p.inCents)}</p>
            <p>Out so far: {formatCents(p.outCents)}</p>
            <p className="text-white/70">On hand: {formatCents(p.inCents - p.outCents)}</p>
          </Tooltip>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        In: family payments and fundraisers. Out: Walkoffs. Estimates aren&apos;t counted.
      </p>
    </figure>
  );
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Run difference in each final game: up for wins, down for losses. */
export function RunsChart({ games, year }: { games: GameRuns[]; year: number }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [at, setAt] = useState<number | null>(null);
  const H = 96;
  const mid = H / 2;
  const maxDiff = Math.max(1, ...games.map((g) => Math.abs(g.us - g.them)));
  const slot = games.length ? width / games.length : 0;
  const barW = Math.max(4, Math.min(22, slot - 4));
  const g = at === null ? null : games[at]!;
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setAt(null)}>
      {width > 0 && games.length > 0 && (
        <svg width={width} height={H} role="img" aria-label="Run difference by game">
          <line x1={0} x2={width} y1={mid} y2={mid} stroke="#cbd5e1" />
          {games.map((game, i) => {
            const diff = game.us - game.them;
            const len = Math.max(2, (Math.abs(diff) / maxDiff) * (mid - 6));
            const cx = slot * i + slot / 2;
            const color = diff > 0 ? BLUE : diff < 0 ? RED : GRAY;
            return (
              <g key={game.id} onMouseEnter={() => setAt(i)}>
                <rect x={slot * i} y={0} width={slot} height={H} fill="transparent" />
                <rect
                  x={cx - barW / 2}
                  y={diff >= 0 ? mid - len : mid}
                  width={barW}
                  height={len}
                  rx={3}
                  fill={color}
                  opacity={at === null || at === i ? 1 : 0.45}
                />
              </g>
            );
          })}
        </svg>
      )}
      {g && (
        <Tooltip x={slot * at! + slot / 2} y={g.us >= g.them ? 12 : mid}>
          <p className="font-bold">
            {g.result} {g.us}–{g.them}
          </p>
          <p>
            vs {g.opponent} · {shortDate(g.date, year)}
          </p>
        </Tooltip>
      )}
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>Run difference by game</span>
        <span className="flex gap-3">
          <span>
            <span style={{ color: BLUE }}>▲</span> won by
          </span>
          <span>
            <span style={{ color: RED }}>▼</span> lost by
          </span>
        </span>
      </div>
    </div>
  );
}
