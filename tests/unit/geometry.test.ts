import { describe, expect, it } from "vitest";
import { normalizeDeg, planSpin, rotationAt, segmentAtPointer, spinProgress, FULL_TURNS } from "@/lib/wheel/geometry";

describe("wheel geometry", () => {
  it("always lands on the planned segment from any starting rotation", () => {
    for (let i = 0; i < 500; i++) {
      const from = (i * 37.3) % 2000;
      const { targetSegment, toRotation } = planSpin(`draw_${i}`, from);
      expect(segmentAtPointer(toRotation)).toBe(targetSegment);
      expect(toRotation - from).toBeGreaterThanOrEqual(FULL_TURNS * 360);
      expect(toRotation - from).toBeLessThan((FULL_TURNS + 1) * 360);
    }
  });

  it("is deterministic so the projector and control agree", () => {
    expect(planSpin("draw_abc", 10)).toEqual(planSpin("draw_abc", 10));
  });

  it("has a smooth, monotonic progress curve from 0 to 1", () => {
    let prev = 0;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const p = spinProgress(t);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = p;
    }
    expect(spinProgress(0)).toBe(0);
    expect(spinProgress(1)).toBe(1);
    // Continuity at the accel/decel join.
    expect(Math.abs(spinProgress(0.12 - 1e-6) - spinProgress(0.12 + 1e-6))).toBeLessThan(1e-4);
  });

  it("interpolates rotation between start and end", () => {
    const s = { fromRotation: 0, toRotation: 3600 };
    expect(rotationAt(s, 0)).toBe(0);
    expect(rotationAt(s, 1)).toBe(3600);
    expect(normalizeDeg(-30)).toBe(330);
  });
});
