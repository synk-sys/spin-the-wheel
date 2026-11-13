import type { PublicDisplayState, PublicReveal, PublicSpin } from "../domain/types";
import { REDUCED_MOTION_DURATION_MS } from "../wheel/geometry";

/**
 * Pure projector state machine. Given the latest public state and the current
 * (server-corrected) time it decides what the projector should show.
 *
 * Spins are a function of server time, not of "events": a projector that
 * reconnects mid-spin joins the animation at the right point, and one that
 * reconnects after a spin finished shows the result without replaying it.
 */
export type DisplayPhase =
  | { kind: "idle"; rotation: number }
  | { kind: "spinning"; spin: PublicSpin; elapsedMs: number; durationMs: number }
  | { kind: "reveal"; reveal: PublicReveal; rotation: number; celebrate: boolean };

/** How long after a spin ends a freshly loaded projector still celebrates. */
export const CELEBRATE_WINDOW_MS = 8000;

export function effectiveDuration(spin: PublicSpin, reducedMotion: boolean): number {
  return reducedMotion ? Math.min(spin.durationMs, REDUCED_MOTION_DURATION_MS) : spin.durationMs;
}

export function derivePhase(state: PublicDisplayState | null, serverNow: number, reducedMotion = false): DisplayPhase {
  if (!state) return { kind: "idle", rotation: 0 };
  const { spin, reveal } = state;
  const revealMatchesSpin = !!reveal && !!spin && reveal.drawId === spin.spinId;

  if (spin && revealMatchesSpin && !reveal!.voided) {
    const duration = effectiveDuration(spin, reducedMotion);
    const elapsed = serverNow - spin.startedAt;
    if (elapsed < duration) return { kind: "spinning", spin, elapsedMs: Math.max(0, elapsed), durationMs: duration };
    return { kind: "reveal", reveal: reveal!, rotation: spin.toRotation, celebrate: elapsed - duration < CELEBRATE_WINDOW_MS };
  }
  if (reveal && !reveal.voided && !spin) {
    return { kind: "reveal", reveal, rotation: state.wheelRotation, celebrate: false };
  }
  return { kind: "idle", rotation: state.wheelRotation };
}

/** Estimates server clock offset from a request round-trip. */
export function clockOffset(serverNow: number, sentAt: number, receivedAt: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}
