"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical, Gauge, Gift, History, LogOut, MonitorPlay, Radio, Users } from "lucide-react";
import { BrandMark } from "@/components/brand";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RaffleEnvProvider, useRaffleEnv } from "@/lib/client/env-context";
import type { RaffleEnv } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: Gauge },
  { href: "/admin/control", label: "Control", icon: Radio },
  { href: "/admin/participants", label: "Participants", icon: Users },
  { href: "/admin/prizes", label: "Prizes", icon: Gift },
  { href: "/admin/history", label: "History", icon: History },
];

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <RaffleEnvProvider>
      <ShellInner email={email}>{children}</ShellInner>
    </RaffleEnvProvider>
  );
}

function EnvSwitch() {
  const { env, setEnv } = useRaffleEnv();
  const [confirm, setConfirm] = useState(false);
  const choose = (next: RaffleEnv) => {
    if (next === env) return;
    if (next === "production") setConfirm(true);
    else setEnv("demo");
  };
  return (
    <>
      <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm" role="radiogroup" aria-label="Raffle environment">
        {(["demo", "production"] as const).map((e) => (
          <button
            key={e}
            role="radio"
            aria-checked={env === e}
            onClick={() => choose(e)}
            className={cn(
              "rounded-md px-3 py-1 font-medium capitalize transition",
              env === e ? (e === "demo" ? "bg-amber-400 text-amber-950 shadow-sm" : "bg-red-600 text-white shadow-sm") : "text-muted-foreground hover:text-foreground",
            )}
          >
            {e === "demo" ? "Demo" : "Production"}
          </button>
        ))}
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to the production raffle?</AlertDialogTitle>
            <AlertDialogDescription>
              Production uses the real attendee list and records real winners. Every action is audited. Demo data is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay in demo</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setEnv("production");
                setConfirm(false);
              }}
            >
              Switch to production
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ShellInner({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { env, ready } = useRaffleEnv();

  const signOut = async () => {
    await fetch("/api/auth/session", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" });
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="no-print sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <Link href="/admin" className="flex items-center gap-2.5">
            <BrandMark className="size-9 rounded-lg p-1" />
            <div className="leading-tight">
              <p className="font-display text-sm font-bold">DevFest Toronto 2026</p>
              <p className="text-xs text-muted-foreground">Raffle organizer</p>
            </div>
          </Link>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Admin">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" /> {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <EnvSwitch />
            <a href={`/display?env=${env}`} target="_blank" rel="noopener" className="hidden sm:block">
              <Button variant="outline" size="sm">
                <MonitorPlay /> Projector
              </Button>
            </a>
            <span className="hidden text-xs text-muted-foreground lg:inline">{email}</span>
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sign out">
              <LogOut />
            </Button>
          </div>
        </div>
        {env === "demo" ? (
          <div className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-1 text-xs font-semibold text-amber-950" role="status">
            <FlaskConical className="size-3.5" /> DEMO MODE — practice data only. Nothing here affects the production raffle.
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 bg-red-600 px-4 py-1 text-xs font-semibold text-white" role="status">
            <Radio className="size-3.5" /> PRODUCTION — real attendees, real winners. All actions are audited.
          </div>
        )}
      </header>
      <main className="print-full mx-auto max-w-7xl px-4 py-6">{ready ? children : null}</main>
    </div>
  );
}
