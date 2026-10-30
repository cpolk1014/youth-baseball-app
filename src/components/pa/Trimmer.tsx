"use client";

import { useEffect, useMemo, useRef } from "react";
import { clampClip, formatTime, parseTime, type ClipRange } from "@/lib/pa/clip";

/** Pick the slice of a song to keep: waveform, start and end sliders, exact times. */
export function Trimmer({
  song,
  range,
  onChange,
}: {
  song: AudioBuffer;
  range: ClipRange;
  onChange: (r: ClipRange) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const total = song.duration;

  // Loudness per column, for the waveform.
  const peaks = useMemo(() => {
    const data = song.getChannelData(0);
    const cols = 300;
    const step = Math.max(1, Math.floor(data.length / cols));
    const out: number[] = [];
    for (let c = 0; c < cols; c++) {
      let max = 0;
      for (let i = c * step; i < Math.min(data.length, (c + 1) * step); i += 16) {
        max = Math.max(max, Math.abs(data[i]!));
      }
      out.push(max);
    }
    const top = Math.max(...out, 0.01);
    return out.map((p) => p / top);
  }, [song]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const w = (el.width = el.clientWidth * 2);
    const h = (el.height = el.clientHeight * 2);
    const g = el.getContext("2d")!;
    g.clearRect(0, 0, w, h);
    const team = getComputedStyle(el).getPropertyValue("--team").trim() || "#0b1f3a";
    const a = (range.start / total) * w;
    const b = (range.end / total) * w;
    g.fillStyle = "rgba(148,163,184,0.18)";
    g.fillRect(a, 0, b - a, h);
    const colW = w / peaks.length;
    peaks.forEach((p, i) => {
      const x = i * colW;
      const inside = x >= a && x <= b;
      g.fillStyle = inside ? team : "#cbd5e1";
      const barH = Math.max(2, p * h * 0.9);
      g.fillRect(x, (h - barH) / 2, Math.max(1, colW - 1), barH);
    });
  }, [peaks, range, total]);

  const set = (r: ClipRange) => onChange(clampClip(r, total));
  const len = range.end - range.start;

  return (
    <div className="flex flex-col gap-3">
      <canvas ref={canvas} className="h-20 w-full rounded-lg bg-slate-50" aria-hidden="true" />
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">Start at {formatTime(range.start)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          step={0.1}
          value={range.start}
          // Moving the start keeps the same length when it can.
          onChange={(e) => {
            const start = Number(e.target.value);
            set({ start, end: start + len });
          }}
          className="h-10 w-full accent-[var(--team)]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold">
          End at {formatTime(range.end)} ({formatTime(len)} long)
        </span>
        <input
          type="range"
          min={0}
          max={total}
          step={0.1}
          value={range.end}
          onChange={(e) => set({ start: range.start, end: Number(e.target.value) })}
          className="h-10 w-full accent-[var(--team)]"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <TimeBox label="Start" value={range.start} onSet={(s) => set({ start: s, end: s + len })} />
        <TimeBox label="End" value={range.end} onSet={(e) => set({ start: range.start, end: e })} />
      </div>
      <p className="text-sm text-slate-600">Up to 20 seconds. Song is {formatTime(total)} long.</p>
    </div>
  );
}

function TimeBox({
  label,
  value,
  onSet,
}: {
  label: string;
  value: number;
  onSet: (s: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <input
        key={value}
        defaultValue={formatTime(value)}
        inputMode="decimal"
        aria-label={`${label} time`}
        onBlur={(e) => {
          const t = parseTime(e.target.value);
          if (t !== null) onSet(t);
          else e.target.value = formatTime(value);
        }}
        className="h-11 w-full min-w-0 rounded-lg border-2 border-slate-300 px-2 text-lg focus:border-[var(--team)] focus:outline-none"
      />
    </label>
  );
}
