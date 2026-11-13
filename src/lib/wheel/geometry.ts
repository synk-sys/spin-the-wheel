/**
 * Wheel geometry and animation curve, shared by the projector and the control
 * page so both render the same motion from the same server-provided spin.
 *
 * The wheel is decorative: segments do NOT represent participants. The winner
 * is chosen on the server; the target segment is derived from the draw ID only
 * so the animation lands somewhere deterministic and repeatable.
 */
export const SEGMENT_COUNT = 16;
export const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;
export const SPIN_DURATION_MS = 7000;
export const REDUCED_MOTION_DURATION_MS = 1200;
export const FULL_TURNS = 7;

export const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"] as const;

export const SEGMENT_GLYPHS = ["</>", "{ }", "★", "⚡", "#", "λ", "∞", "♥", "</>", "{ }", "★", "⚡", "#", "λ", "∞", "♥"];

/** FNV-1a 32-bit hash: deterministic, non-cryptographic (visual use only). */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Computes the final rotation for a spin. Rotation is clockwise in degrees;
 * the pointer is fixed at the top (0°). With the wheel rotated by R, the wheel
 * angle under the pointer is (-R mod 360).
 */
export function planSpin(spinId: string, fromRotation: number) {
  const h = hash32(spinId);
  const targetSegment = h % SEGMENT_COUNT;
  // Land within the middle 70% of the segment so it never looks ambiguous.
  const jitter = (((h >>> 8) % 1000) / 1000 - 0.5) * SEGMENT_ANGLE * 0.7;
  const targetAngle = targetSegment * SEGMENT_ANGLE + SEGMENT_ANGLE / 2 + jitter;
  const desiredRest = normalizeDeg(-targetAngle);
  const delta = normalizeDeg(desiredRest - normalizeDeg(fromRotation));
  const toRotation = fromRotation + FULL_TURNS * 360 + delta;
  return { targetSegment, toRotation };
}

/** Segment index under the pointer for a given rotation. */
export function segmentAtPointer(rotation: number): number {
  return Math.floor(normalizeDeg(-rotation) / SEGMENT_ANGLE) % SEGMENT_COUNT;
}

/**
 * Spin progress curve: a short ease-in acceleration followed by a long
 * quartic deceleration, joined with matching velocity so motion is smooth.
 * Maps t in [0,1] to progress in [0,1].
 */
export function spinProgress(t: number, accel = 0.12): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const k = 1 / (accel * accel + (accel * (1 - accel)) / 2);
  if (t < accel) return k * t * t;
  const c = (k * accel * (1 - accel)) / 2;
  const u = (t - accel) / (1 - accel);
  return k * accel * accel + c * (1 - Math.pow(1 - u, 4));
}

export function rotationAt(spin: { fromRotation: number; toRotation: number }, t: number): number {
  return spin.fromRotation + (spin.toRotation - spin.fromRotation) * spinProgress(t);
}
