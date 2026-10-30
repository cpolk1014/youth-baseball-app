"use client";

import { useEffect, useRef, useState } from "react";
import { actorsIn, keysFor, playDuration, positionAt } from "@/lib/plays/animate";
import { distance, hexToRgb, readableOnWhite } from "@/lib/branding/color";
import { teamColors } from "@/lib/branding/theme";
import { useAppData } from "@/lib/data/store";
import { isFielder } from "@/lib/plays/quiz";
import type { Actor, Play } from "@/lib/plays/types";

const GRASS = "#4f8a3c";
const GRASS_DARK = "#467d35";
const CLAY = "#c98a55";
const CHALK = "#f8f6ef";
const NAVY = "#1e3a6e";
const RED = "#c8352e";
const GOLD = "#e8b324";

const isRunner = (a: Actor) => !isFielder(a);

/**
 * The field at one moment of a play. Tap a player to follow them; `focus` rings that
 * player and brightens their path.
 */
export function PlayField({
  play,
  time,
  focus,
  onSelect,
  showPaths = true,
}: {
  play: Play;
  time: number;
  focus: Actor | null;
  onSelect?: (actor: Actor | null) => void;
  showPaths?: boolean;
}) {
  // Fielders wear the team's colors; runners stay red, or navy if the team is red.
  const { main } = teamColors(useAppData()?.team.colors);
  const fielder = readableOnWhite(main);
  const runner = distance(hexToRgb(fielder)!, hexToRgb(RED)!) < 160 ? NAVY : RED;
  const actors = actorsIn(play);
  const [bx, by] = positionAt(play.ball, time);
  return (
    <svg
      viewBox="0 0 400 400"
      role="img"
      aria-label={`${play.name}: field showing where each player goes`}
      className="block h-auto w-full rounded-xl"
      style={{ background: GRASS_DARK }}
    >
      <defs>
        <pattern
          id="mow"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="40" height="40" fill={GRASS} />
          <rect width="20" height="40" fill={GRASS_DARK} />
        </pattern>
      </defs>
      <path d="M200,370 L2,172 A280,280 0 0 1 398,172 Z" fill="url(#mow)" />
      <path
        d="M2,172 A280,280 0 0 1 398,172"
        fill="none"
        stroke={CLAY}
        strokeWidth="10"
        opacity=".85"
      />
      <path d="M200,394 L114,308 L114,296 A86,86 0 0 1 286,296 L286,308 Z" fill={CLAY} />
      <polygon points="200,352 248,300 200,250 152,300" fill={GRASS} />
      <circle cx="200" cy="305" r="10" fill={CLAY} />
      <rect x="197" y="304" width="6" height="2" fill={CHALK} />
      <circle cx="200" cy="372" r="15" fill={CLAY} />
      <line x1="200" y1="370" x2="2" y2="172" stroke={CHALK} strokeWidth="1.6" />
      <line x1="200" y1="370" x2="398" y2="172" stroke={CHALK} strokeWidth="1.6" />
      <g fill={CHALK}>
        <rect x="266" y="296" width="8" height="8" transform="rotate(45 270 300)" />
        <rect x="196" y="226" width="8" height="8" transform="rotate(45 200 230)" />
        <rect x="126" y="296" width="8" height="8" transform="rotate(45 130 300)" />
        <path d="M195,367 h10 v4 l-5,4 l-5,-4 z" />
      </g>

      {showPaths && (
        <g fill="none" strokeLinecap="round">
          <polyline
            points={play.ball.map((k) => `${k[1]},${k[2]}`).join(" ")}
            stroke="#fff"
            strokeWidth="1.4"
            strokeDasharray="2 3"
            opacity=".8"
          />
          {actors.map((a) => {
            const keys = keysFor(play, a);
            if (keys.length < 2) return null;
            const on = a === focus;
            return (
              <polyline
                key={a}
                points={keys.map((k) => `${k[1]},${k[2]}`).join(" ")}
                stroke={on ? GOLD : isRunner(a) ? "#ffd2cc" : "#dbe6ff"}
                strokeWidth={on ? 3 : 1.6}
                strokeDasharray="5 4"
                opacity={!focus ? 0.6 : on ? 1 : 0.18}
              />
            );
          })}
        </g>
      )}

      {actors.map((a) => {
        const [x, y] = positionAt(keysFor(play, a), time);
        const out = play.out?.[a];
        const on = a === focus;
        return (
          <g
            key={a}
            transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
            opacity={!focus || on ? 1 : 0.55}
            onClick={onSelect ? () => onSelect(on ? null : a) : undefined}
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            {/* Bigger invisible target so a finger can hit a 10px dot. */}
            {onSelect && <circle r="16" fill="transparent" />}
            {on && <circle r="13" fill="none" stroke={GOLD} strokeWidth="3" />}
            <circle
              r="9.5"
              fill={isRunner(a) ? runner : fielder}
              stroke="#fff"
              strokeWidth="1.2"
              opacity={out !== undefined && time >= out ? 0.35 : 1}
            />
            <text
              textAnchor="middle"
              dy="3"
              fill="#fff"
              fontWeight="700"
              fontSize={a.length > 1 ? 8.5 : 10}
              style={{ pointerEvents: "none" }}
            >
              {a}
            </text>
          </g>
        );
      })}
      <circle cx={bx} cy={by} r="4" fill="#fff" stroke="#222" strokeWidth="1" />
    </svg>
  );
}

/** Play/pause/scrub state for a play's animation. Give the caller `key={play.id}`. */
export function usePlayback(play: Play, autoPlay = false) {
  const duration = playDuration(play);
  const [time, setTimeState] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [slow, setSlow] = useState(true);
  // The animation loop reads the latest time from here, so pausing or changing speed
  // carries on from the same spot.
  const timeRef = useRef(0);
  const setTime = (t: number) => {
    timeRef.current = t;
    setTimeState(t);
  };

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const next = Math.min(duration, timeRef.current + dt * (slow ? 0.5 : 1));
      timeRef.current = next;
      setTimeState(next);
      if (next >= duration) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, slow, duration]);

  return {
    time,
    duration,
    playing,
    slow,
    toggle: () => {
      if (!playing && time >= duration) setTime(0);
      setPlaying(!playing);
    },
    restart: () => {
      setTime(0);
      setPlaying(true);
    },
    seek: (t: number) => {
      setPlaying(false);
      setTime(t);
    },
    toggleSlow: () => setSlow(!slow),
  };
}

const ctrl =
  "h-11 shrink-0 rounded-lg px-3 text-base font-bold active:opacity-80 disabled:opacity-40";

/** Field plus Play / Restart / Slow and a scrubber. Give it `key={play.id}`. */
export function PlayAnimation({
  play,
  focus,
  onSelect,
  autoPlay,
  onTime,
}: {
  play: Play;
  focus: Actor | null;
  onSelect?: (actor: Actor | null) => void;
  autoPlay?: boolean;
  /** Reports the time so a parent can highlight the current step. */
  onTime?: (time: number) => void;
}) {
  const pb = usePlayback(play, autoPlay);
  useEffect(() => onTime?.(pb.time), [onTime, pb.time]);
  const done = pb.time >= pb.duration;
  return (
    <div className="flex flex-col gap-2">
      <PlayField play={play} time={pb.time} focus={focus} onSelect={onSelect} />
      <div className="flex items-center gap-2">
        <button onClick={pb.toggle} className={`${ctrl} min-w-24 bg-[#c8352e] text-white`}>
          {pb.playing ? "Pause" : done ? "Replay" : "Play"}
        </button>
        <button onClick={pb.restart} className={`${ctrl} bg-slate-200`} aria-label="Restart">
          ↺
        </button>
        <button
          onClick={pb.toggleSlow}
          aria-pressed={pb.slow}
          className={`${ctrl} ${pb.slow ? "bg-slate-800 text-white" : "bg-slate-200"}`}
        >
          Slow
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round((pb.time / pb.duration) * 1000)}
          onChange={(e) => pb.seek((Number(e.target.value) / 1000) * pb.duration)}
          aria-label="Scrub through the play"
          className="min-w-0 flex-1 accent-[#c8352e]"
        />
      </div>
    </div>
  );
}
