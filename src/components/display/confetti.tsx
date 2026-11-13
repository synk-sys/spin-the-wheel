"use client";

import { useEffect, useRef } from "react";
import { GOOGLE_COLORS } from "@/lib/wheel/geometry";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  shape: 0 | 1;
}

/**
 * Lightweight canvas confetti in Google colors. Fires when `fireKey` changes.
 * Disabled entirely for users who prefer reduced motion.
 */
export function Confetti({ fireKey, reducedMotion }: { fireKey: string | null; reducedMotion: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fireKey || reducedMotion) return;
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      el.width = el.clientWidth * dpr;
      el.height = el.clientHeight * dpr;
    };
    resize();
    const W = () => el.width;
    const H = () => el.height;
    // Pseudo-random from a seeded LCG: confetti is purely visual.
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const parts: Particle[] = [];
    const burst = (originX: number, dir: number, count: number) => {
      for (let i = 0; i < count; i++) {
        const speed = (14 + rnd() * 18) * dpr;
        const angle = (-Math.PI / 2) + dir * (0.25 + rnd() * 0.7);
        parts.push({
          x: originX,
          y: H() * 0.95,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: rnd() * Math.PI,
          vr: (rnd() - 0.5) * 0.3,
          w: (8 + rnd() * 10) * dpr,
          h: (5 + rnd() * 8) * dpr,
          color: GOOGLE_COLORS[Math.floor(rnd() * 4)],
          shape: rnd() > 0.7 ? 1 : 0,
        });
      }
    };
    burst(W() * 0.05, 1, 160);
    burst(W() * 0.95, -1, 160);
    const rain = setTimeout(() => {
      for (let i = 0; i < 140; i++) {
        parts.push({
          x: rnd() * W(),
          y: -20 * dpr,
          vx: (rnd() - 0.5) * 4 * dpr,
          vy: (2 + rnd() * 4) * dpr,
          rot: rnd() * Math.PI,
          vr: (rnd() - 0.5) * 0.25,
          w: (8 + rnd() * 10) * dpr,
          h: (5 + rnd() * 8) * dpr,
          color: GOOGLE_COLORS[Math.floor(rnd() * 4)],
          shape: rnd() > 0.7 ? 1 : 0,
        });
      }
    }, 450);

    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      ctx.clearRect(0, 0, W(), H());
      const fade = Math.max(0, Math.min(1, (6500 - (now - start)) / 1500));
      for (const p of parts) {
        p.vy += 0.38 * dpr;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx + Math.sin((now - start) / 300 + p.rot) * 0.8 * dpr;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape) {
          ctx.beginPath();
          ctx.arc(0, 0, p.h / 1.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      if (now - start < 6500) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W(), H());
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rain);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, W(), H());
    };
  }, [fireKey, reducedMotion]);

  return <canvas ref={canvas} className="pointer-events-none absolute inset-0 z-40 h-full w-full" aria-hidden="true" />;
}
