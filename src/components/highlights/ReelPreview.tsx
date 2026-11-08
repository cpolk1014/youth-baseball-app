"use client";

// A live preview of the Pine Tar reel: the same graphics the finished video gets, drawn over
// the clip as it plays (intro card → the cut with the name banner → slow-mo → outro).
// Nothing is made or saved; it's a quick look before "Make my video".
import { useCallback, useEffect, useRef, useState } from "react";
import { drawCard, drawPlay, INTRO, lookFor, OUTRO, type CardInfo } from "@/lib/highlights/draw";

type Phase = "intro" | "clip" | "replay" | "outro";

export function ReelPreview({
  url,
  start,
  end,
  replay,
  slow,
  info,
}: {
  url: string;
  start: number;
  end: number;
  replay: boolean;
  slow: { from: number; to: number };
  info: CardInfo;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef(0);
  const [size, setSize] = useState({ w: 640, h: 360 });
  const [playing, setPlaying] = useState(false);
  // The loop reads the latest choices without restarting.
  const latest = useRef({ start, end, replay, slow, info });
  useEffect(() => {
    latest.current = { start, end, replay, slow, info };
  }, [start, end, replay, slow, info]);

  const drawPoster = useCallback(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const { info: i } = latest.current;
    drawCard(ctx, size.w, size.h, lookFor(i), 1.2, "intro", i);
  }, [size]);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    video.current?.pause();
    if (video.current) video.current.playbackRate = 1;
    setPlaying(false);
  }, []);

  // While stopped, the preview shows the title card, kept up to date with the choices.
  useEffect(() => {
    if (!playing) drawPoster();
  }, [playing, drawPoster, info]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const play = () => {
    const v = video.current;
    const ctx = canvas.current?.getContext("2d");
    if (!v || !ctx) return;
    const { w, h } = size;
    let phase: Phase = "intro";
    let t0 = performance.now();
    v.pause();
    v.playbackRate = 1;
    v.currentTime = latest.current.start;
    setPlaying(true);

    const tick = (now: number) => {
      const p = latest.current;
      const look = lookFor(p.info);
      const t = (now - t0) / 1000;
      if (phase === "intro") {
        drawCard(ctx, w, h, look, t, "intro", p.info);
        if (t >= INTRO) {
          phase = "clip";
          v.currentTime = p.start;
          void v.play().catch(() => stop());
        }
      } else if (phase === "clip" || phase === "replay") {
        const isReplay = phase === "replay";
        drawPlay(ctx, w, h, look, v, Math.max(0, v.currentTime - p.start), isReplay, p.info);
        const until = isReplay ? p.slow.to : p.end;
        if (v.currentTime >= until - 0.02 || v.ended) {
          if (!isReplay && p.replay) {
            phase = "replay";
            v.currentTime = p.slow.from;
            v.playbackRate = 0.5;
          } else {
            phase = "outro";
            t0 = now;
            v.pause();
          }
        }
      } else {
        drawCard(ctx, w, h, look, t, "outro", p.info);
        if (t >= OUTRO) {
          stop();
          return;
        }
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative mx-auto w-full overflow-hidden rounded-xl bg-black"
        style={{
          aspectRatio: `${size.w} / ${size.h}`,
          maxWidth: size.h > size.w ? "20rem" : undefined,
        }}
      >
        {/* The clip plays underneath; the canvas on top shows it with the graphics. */}
        <video
          ref={video}
          key={url}
          src={url}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onLoadedMetadata={(e) => {
            const { videoWidth: vw, videoHeight: vh } = e.currentTarget;
            if (vw && vh) setSize(vw >= vh ? { w: 640, h: 360 } : { w: 360, h: 640 });
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />
        <canvas
          ref={canvas}
          width={size.w}
          height={size.h}
          className="absolute inset-0 h-full w-full"
          aria-label="Preview of the highlight"
          role="img"
        />
        {/* Tapping the picture plays or stops it too. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => (playing ? stop() : play())}
          className="absolute inset-0"
        />
      </div>
      <button
        type="button"
        onClick={() => (playing ? stop() : play())}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white text-base font-bold active:bg-slate-100"
      >
        {playing ? "⏹ Stop" : "▶️ Play preview"}
      </button>
      <p className="text-center text-sm text-slate-600">
        A quick look, with no sound. The game sound and announcer go in when you make it.
      </p>
    </div>
  );
}
