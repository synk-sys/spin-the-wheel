"use client";

import { Badge } from "@/components/ui/badge";
import type { Draw, DrawStatus, EligibilityStatus, Prize, PrizeStatus, PublicDisplayState, RaffleEnv } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export interface AdminStateResponse {
  env: RaffleEnv;
  actor: string;
  backend: "memory" | "firestore";
  serverNow: number;
  state: {
    status: "ready" | "paused" | "completed";
    currentPrizeId: string | null;
    activeDrawId: string | null;
    drawSequence: number;
    eligibleCount: number;
    winnerCount: number;
    participantCount: number;
    soundEnabled: boolean;
    drawInProgress: boolean;
    spinEndsAt: number;
  };
  public: PublicDisplayState;
  prizes: Prize[];
  activeDraw: Draw | null;
  recentDraws: Draw[];
}

const PARTICIPANT_STYLE: Record<EligibilityStatus, string> = {
  eligible: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  ineligible: "bg-slate-100 text-slate-700 ring-slate-200",
  winner: "bg-blue-50 text-blue-800 ring-blue-200",
  removed: "bg-red-50 text-red-700 ring-red-200 line-through",
};

const DRAW_STYLE: Record<DrawStatus, string> = {
  selected: "bg-blue-50 text-blue-800 ring-blue-200",
  announced: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  confirmed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  claimed: "bg-emerald-600 text-white ring-emerald-700",
  absent: "bg-amber-50 text-amber-900 ring-amber-300",
  voided: "bg-red-50 text-red-700 ring-red-200",
};

const PRIZE_STYLE: Record<PrizeStatus, string> = {
  upcoming: "bg-slate-100 text-slate-700 ring-slate-200",
  in_progress: "bg-blue-50 text-blue-800 ring-blue-200",
  awarded: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  claimed: "bg-emerald-600 text-white ring-emerald-700",
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <Badge className={cn("rounded-full border-0 font-medium capitalize ring-1 ring-inset", className)}>{children}</Badge>;
}

export function ParticipantStatusBadge({ status }: { status: EligibilityStatus }) {
  return <Pill className={PARTICIPANT_STYLE[status]}>{status}</Pill>;
}

export function DrawStatusBadge({ status }: { status: DrawStatus }) {
  return <Pill className={DRAW_STYLE[status]}>{status}</Pill>;
}

export function PrizeStatusBadge({ status }: { status: PrizeStatus }) {
  return <Pill className={PRIZE_STYLE[status]}>{status.replace("_", " ")}</Pill>;
}

export function StatCard({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-3xl font-bold tabular-nums", accent)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function formatTime(t: number | null | undefined) {
  if (!t) return "—";
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
