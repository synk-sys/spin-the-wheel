"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Gift, History, MonitorPlay, Radio, Upload, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRaffleEnv } from "@/lib/client/env-context";
import { useApi } from "@/lib/client/use-api";
import { PageHeader, StatCard, type AdminStateResponse } from "./common";

const STEPS = [
  { href: "/admin/participants/import", icon: Upload, title: "Import attendees", text: "Upload the attendee CSV, review duplicates, confirm." },
  { href: "/admin/prizes", icon: Gift, title: "Set up prizes", text: "Add prizes, quantities, and the order they're drawn in." },
  { href: "/display", icon: MonitorPlay, title: "Open the projector", text: "Open /display on the projector laptop and go fullscreen." },
  { href: "/admin/control", icon: Radio, title: "Run the raffle", text: "Pick a prize, spin, confirm winners, repeat." },
  { href: "/admin/history", icon: History, title: "Export results", text: "Download or print the auditable winner report." },
];

export function Overview() {
  const { env } = useRaffleEnv();
  const { data } = useApi<AdminStateResponse>("/api/admin/state", env, 5000);
  const s = data?.state;
  const prizesLeft = data?.prizes.reduce((n, p) => n + p.remainingQuantity, 0);

  return (
    <div>
      <PageHeader
        title="Organizer overview"
        description={env === "demo" ? "You're in demo mode: 300 fictional attendees and sample prizes to practice with." : "Production raffle for DevFest Toronto 2026."}
        actions={
          <Link href="/admin/control">
            <Button>
              <Radio /> Go to raffle control
            </Button>
          </Link>
        }
      />

      {data?.backend === "memory" && env === "production" && (
        <Alert className="mb-6">
          <AlertTriangle />
          <AlertTitle>Local in-memory storage</AlertTitle>
          <AlertDescription>
            This server stores data locally (DATA_BACKEND=memory). For the live event, deploy with DATA_BACKEND=firestore so data is durable and the projector syncs in
            real time.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Participants" value={s?.participantCount ?? "—"} hint="Excludes removed" />
        <StatCard label="Eligible now" value={s?.eligibleCount ?? "—"} accent="text-emerald-700" />
        <StatCard label="Winners" value={s?.winnerCount ?? "—"} accent="text-g-blue" />
        <StatCard label="Prizes left" value={prizesLeft ?? "—"} hint={data ? `${data.prizes.length} prize rounds` : undefined} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Event-day checklist</CardTitle>
          <CardDescription>Practice everything in demo mode first, then switch to Production.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 md:grid-cols-5">
            {STEPS.map(({ href, icon: Icon, title, text }, i) => (
              <li key={href}>
                <Link
                  href={href === "/display" ? `/display?env=${env}` : href}
                  target={href === "/display" ? "_blank" : undefined}
                  className="group flex h-full flex-col rounded-xl border p-4 transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">{i + 1}</span>
                    <Icon className="size-4" />
                  </span>
                  <span className="mt-2 font-semibold">{title}</span>
                  <span className="mt-1 text-sm text-muted-foreground">{text}</span>
                  <ArrowRight className="mt-auto size-4 self-end pt-1 text-muted-foreground transition group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="size-3.5" /> Winners are selected on the server with crypto.randomInt from the full eligible pool. Every eligible attendee has exactly one entry.
      </p>
    </div>
  );
}
