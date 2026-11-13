"use client";

import { forwardRef, memo } from "react";
import { GOOGLE_COLORS, SEGMENT_ANGLE, SEGMENT_COUNT, SEGMENT_GLYPHS } from "@/lib/wheel/geometry";
import { cn } from "@/lib/utils";

const C = 500;
const R = 470;
const RIM = 500;

function polar(angleDeg: number, r: number) {
  const a = (angleDeg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)] as const;
}

function segmentPath(i: number) {
  const start = i * SEGMENT_ANGLE;
  const end = start + SEGMENT_ANGLE;
  const [x1, y1] = polar(start, R);
  const [x2, y2] = polar(end, R);
  return `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2} Z`;
}

export const BRAND_LOGO_URL = process.env.NEXT_PUBLIC_BRAND_LOGO_URL || "/branding/devfest-toronto-2026.svg";

interface WheelProps {
  className?: string;
  spinning?: boolean;
  initialRotation?: number;
  highlightSegment?: number | null;
}

/**
 * Decorative raffle wheel (SVG). Rotation is driven imperatively through the
 * forwarded ref (a <g>) so animation frames never re-render React.
 * Segments are decorative and do not represent participants.
 */
export const Wheel = memo(
  forwardRef<SVGGElement, WheelProps>(function Wheel({ className, spinning, initialRotation = 0, highlightSegment = null }, ref) {
    const bulbs = Array.from({ length: SEGMENT_COUNT * 2 }, (_, i) => polar(i * (SEGMENT_ANGLE / 2), RIM - 14));
    return (
      <svg viewBox="-20 -60 1040 1080" className={cn("block h-full w-full select-none", className)} aria-hidden="true">
        <defs>
          <radialGradient id="wheel-shine" cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="60%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <filter id="wheel-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#000" floodOpacity="0.45" />
          </filter>
          <filter id="pointer-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* Rim */}
        <circle cx={C} cy={C} r={RIM} fill="#0b1b3a" filter="url(#wheel-shadow)" />
        <circle cx={C} cy={C} r={RIM - 4} fill="none" stroke="#ffffff22" strokeWidth="2" />
        {bulbs.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={8}
            className={cn("wheel-bulb", spinning && "wheel-bulb-active")}
            style={{ animationDelay: `${(i % 2) * 0.25}s` }}
            fill={i % 2 ? "#FBBC05" : "#ffffff"}
          />
        ))}

        {/* Rotating face */}
        <g ref={ref} transform={`rotate(${initialRotation} ${C} ${C})`}>
          {Array.from({ length: SEGMENT_COUNT }, (_, i) => {
            const color = GOOGLE_COLORS[i % GOOGLE_COLORS.length];
            const mid = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
            const dark = color === "#FBBC05";
            return (
              <g key={i}>
                <path d={segmentPath(i)} fill={color} stroke="#0b1b3a" strokeWidth="5" opacity={highlightSegment === null || highlightSegment === i ? 1 : 0.55} />
                <g transform={`rotate(${mid} ${C} ${C})`}>
                  <text
                    x={C}
                    y={C - R * 0.74}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily="var(--font-display), system-ui, sans-serif"
                    fontWeight={800}
                    fontSize={44}
                    fill={dark ? "#202124" : "#ffffff"}
                  >
                    {SEGMENT_GLYPHS[i]}
                  </text>
                </g>
              </g>
            );
          })}
          <circle cx={C} cy={C} r={R} fill="url(#wheel-shine)" pointerEvents="none" />
        </g>

        {/* Hub with replaceable branding */}
        <circle cx={C} cy={C} r={168} fill="#0b1b3a" />
        <circle cx={C} cy={C} r={156} fill="#ffffff" />
        <image href={BRAND_LOGO_URL} x={C - 128} y={C - 128} width={256} height={256} preserveAspectRatio="xMidYMid meet" />

        {/* Fixed pointer at the top */}
        <g filter="url(#pointer-shadow)">
          <path d={`M ${C - 46} -38 L ${C + 46} -38 L ${C} 62 Z`} fill="#ffffff" stroke="#0b1b3a" strokeWidth="6" strokeLinejoin="round" />
          <circle cx={C} cy={-14} r={12} fill="#EA4335" />
        </g>
      </svg>
    );
  }),
);
