"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { PublicSpin } from "@/lib/domain/types";
import { rotationAt, SEGMENT_ANGLE } from "@/lib/wheel/geometry";

const C = 500;

export function setWheelRotation(el: SVGGElement | null, deg: number) {
  el?.setAttribute("transform", `rotate(${deg.toFixed(3)} ${C} ${C})`);
}

/**
 * Drives the wheel from server time: rotation = f(serverNow - startedAt).
 * The same spin renders identically on every screen, and a projector that
 * joins late picks up mid-spin instead of restarting.
 */
export function useSpinAnimation(opts: {
  wheel: React.RefObject<SVGGElement | null>;
  spin: PublicSpin | null;
  active: boolean;
  durationMs: number;
  restRotation: number;
  serverOffset: number;
  reducedMotion: boolean;
  onSegmentTick?: () => void;
}) {
  const { wheel, spin, active, durationMs, restRotation, serverOffset, reducedMotion, onSegmentTick } = opts;
  const tickRef = useRef(onSegmentTick);
  useEffect(() => {
    tickRef.current = onSegmentTick;
  }, [onSegmentTick]);

  useEffect(() => {
    if (!active || !spin) {
      setWheelRotation(wheel.current, restRotation);
      return;
    }
    let raf = 0;
    let lastSegment = -1;
    const frame = () => {
      const now = Date.now() + serverOffset;
      const t = Math.min(1, Math.max(0, (now - spin.startedAt) / durationMs));
      const deg = reducedMotion
        ? spin.fromRotation + (spin.toRotation - spin.fromRotation) * (1 - Math.pow(1 - t, 3))
        : rotationAt(spin, t);
      setWheelRotation(wheel.current, deg);
      const seg = Math.floor(deg / SEGMENT_ANGLE);
      if (seg !== lastSegment) {
        if (lastSegment !== -1) tickRef.current?.();
        lastSegment = seg;
      }
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, spin, durationMs, restRotation, serverOffset, reducedMotion, wheel]);
}

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** Re-renders on an interval; used to advance time-based phases. */
export function useNow(intervalMs: number): number {
  return useSyncExternalStore(
    (cb) => {
      const t = setInterval(cb, intervalMs);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => 0,
  );
}
