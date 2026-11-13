"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  Gift,
  Loader2,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  Undo2,
  UserX,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Wheel } from "@/components/wheel/wheel";
import { useNow, usePrefersReducedMotion, useSpinAnimation } from "@/components/wheel/use-spin-animation";
import { ApiError, apiSend, newIdempotencyKey, requestDraw } from "@/lib/client/api";
import { useRaffleEnv } from "@/lib/client/env-context";
import { useApi } from "@/lib/client/use-api";
import { derivePhase } from "@/lib/display/phase";
import type { Draw } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { DrawStatusBadge, formatTime, NativeSelect, PageHeader, type AdminStateResponse } from "./common";

const DEMO_PHRASE = "RESET DEMO";

export function ControlPanel() {
  const { env } = useRaffleEnv();
  const { data, error, reload, receivedAt } = useApi<AdminStateResponse>("/api/admin/state", env, 1500);
  const [busy, setBusy] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const spinKey = useRef<string | null>(null);
  const announced = useRef<Set<string>>(new Set());
  const wheelRef = useRef<SVGGElement>(null);
  const reduced = usePrefersReducedMotion();
  const now = useNow(250);
  // Server clock offset, measured when the latest state arrived.
  const offset = data && receivedAt ? data.serverNow - receivedAt : 0;
  const serverNow = now + offset;
  const phase = derivePhase(data?.public ?? null, serverNow, reduced);
  const spinning = phase.kind === "spinning";

  useSpinAnimation({
    wheel: wheelRef,
    spin: phase.kind === "spinning" ? phase.spin : null,
    active: spinning,
    durationMs: phase.kind === "spinning" ? phase.durationMs : 1,
    restRotation: phase.kind === "spinning" ? 0 : phase.rotation,
    serverOffset: offset,
    reducedMotion: reduced,
  });

  const act = useCallback(
    async (label: string, fn: () => Promise<unknown>, success?: string) => {
      setBusy(label);
      try {
        await fn();
        if (success) toast.success(success);
        await reload();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Action failed. Check your connection and try again.");
        await reload();
      } finally {
        setBusy(null);
      }
    },
    [reload],
  );

  const raffle = (body: Record<string, unknown>) => apiSend("/api/admin/raffle", env, "POST", body);
  const drawAction = (draw: Draw, action: string, reason?: string) => apiSend(`/api/admin/draws/${draw.drawId}`, env, "POST", { action, reason });

  // After the wheel stops, record that the winner was announced (once per draw).
  const activeDraw = data?.activeDraw ?? null;
  useEffect(() => {
    if (!activeDraw || activeDraw.status !== "selected" || spinning) return;
    if (phase.kind !== "reveal" || announced.current.has(activeDraw.drawId)) return;
    announced.current.add(activeDraw.drawId);
    void apiSend(`/api/admin/draws/${activeDraw.drawId}`, env, "POST", { action: "announce" })
      .then(() => reload())
      .catch(() => undefined);
  }, [activeDraw, spinning, phase.kind, env, reload]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        {error ? <span className="text-destructive">{error.message}</span> : <Loader2 className="size-4 animate-spin" />} {!error && "Loading raffle…"}
      </div>
    );
  }

  const { state, prizes } = data;
  const currentPrize = prizes.find((p) => p.prizeId === state.currentPrizeId) ?? null;
  const prizeDrawable = !!currentPrize && currentPrize.remainingQuantity > 0 && currentPrize.status !== "awarded" && currentPrize.status !== "claimed";
  const paused = state.status === "paused";
  const blockedReason = paused
    ? "Raffle is paused"
    : !currentPrize
      ? "Select a prize"
      : !prizeDrawable
        ? "All of this prize has been drawn — choose the next prize"
        : state.eligibleCount === 0
          ? "No eligible participants left"
          : spinning
            ? "Wheel is spinning…"
            : state.drawInProgress
              ? "A draw is in progress"
              : null;
  const canSpin = !blockedReason && !busy;

  const spin = () =>
    act("spin", async () => {
      // One key per click; reused across automatic retries so a retry can never create a second draw.
      spinKey.current = newIdempotencyKey();
      await requestDraw(env, currentPrize!.prizeId, spinKey.current);
    });

  const statusText = busy === "spin" ? "Drawing a winner securely…" : spinning ? "Wheel is spinning on the projector" : (blockedReason ?? "Ready to spin");

  return (
    <div>
      <PageHeader
        title="Raffle control"
        description="Run the live draw. The projector follows automatically."
        actions={
          <>
            <span className={cn("flex items-center gap-1.5 text-xs", error ? "text-destructive" : "text-emerald-700")}>
              {error ? <WifiOff className="size-3.5" /> : <Wifi className="size-3.5" />}
              {error ? "Connection problem — retrying" : "Synced"}
            </span>
            <a href={`/display?env=${env}`} target="_blank" rel="noopener">
              <Button variant="outline">
                <MonitorPlay /> Open projector display
              </Button>
            </a>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Left: prize + spin */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="size-5 text-g-red" /> Current prize
              </CardTitle>
              <CardDescription>Choose what the next spin is for.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                  aria-label="Current prize"
                  className="h-10 min-w-0 flex-1 text-base"
                  value={state.currentPrizeId ?? ""}
                  disabled={!!busy || spinning}
                  onChange={(e) => act("prize", () => raffle({ action: "set-prize", prizeId: e.target.value || null }))}
                >
                  <option value="">— Select a prize —</option>
                  {prizes.map((p) => (
                    <option key={p.prizeId} value={p.prizeId}>
                      {p.drawOrder}. {p.name} — {p.remainingQuantity}/{p.quantity} left
                    </option>
                  ))}
                </NativeSelect>
                <Button variant="outline" className="h-10" disabled={!!busy || spinning} onClick={() => act("next", () => raffle({ action: "next-prize" }))}>
                  Next prize <ChevronRight />
                </Button>
              </div>
              {prizes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No prizes yet. <Link className="text-primary underline" href="/admin/prizes">Add prizes</Link>.
                </p>
              )}

              <div className="flex items-center gap-5">
                <div className="size-40 shrink-0 sm:size-48">
                  <Wheel ref={wheelRef} spinning={spinning} />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <Button
                    data-testid="spin-button"
                    className="h-16 w-full rounded-2xl bg-g-blue text-xl font-bold shadow-lg shadow-g-blue/30 hover:bg-g-blue/90"
                    disabled={!canSpin}
                    onClick={spin}
                  >
                    {busy === "spin" ? <Loader2 className="size-6 animate-spin" /> : <RotateCcw className="size-6" />} Start spin
                  </Button>
                  <p className="text-sm text-muted-foreground" role="status" aria-live="polite" data-testid="spin-status">
                    {statusText}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{state.eligibleCount}</strong> eligible · {state.winnerCount} winners · draw #{state.drawSequence + 1} next
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Raffle controls</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {paused ? (
                <Button onClick={() => act("resume", () => raffle({ action: "resume" }), "Raffle resumed")} disabled={!!busy}>
                  <Play /> Resume raffle
                </Button>
              ) : (
                <Button variant="outline" onClick={() => act("pause", () => raffle({ action: "pause" }), "Raffle paused")} disabled={!!busy || spinning}>
                  <Pause /> Pause raffle
                </Button>
              )}
              <Button variant="outline" onClick={() => act("sound", () => raffle({ action: "sound", enabled: !state.soundEnabled }))} disabled={!!busy}>
                {state.soundEnabled ? <Volume2 /> : <VolumeX />} Sound {state.soundEnabled ? "on" : "off"}
              </Button>
              <Button variant="outline" onClick={() => act("clear", () => raffle({ action: "clear-reveal" }))} disabled={!!busy || spinning || !data.public.reveal}>
                <Undo2 /> Back to wheel
              </Button>
              {env === "demo" && (
                <Button variant="destructive" onClick={() => setResetOpen(true)} disabled={!!busy || spinning}>
                  <RotateCcw /> Reset demo
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: winner + history */}
        <div className="space-y-6">
          <Card className={cn(activeDraw && activeDraw.status !== "voided" && "ring-2 ring-g-blue/40")}>
            <CardHeader>
              <CardTitle>Current winner</CardTitle>
              <CardDescription>Selected → Announced → Confirmed → Claimed</CardDescription>
            </CardHeader>
            <CardContent>
              {activeDraw ? (
                <div className="space-y-4" data-testid="current-winner">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-2xl font-bold">{spinning ? "Spinning…" : activeDraw.winnerNameSnapshot}</p>
                      <DrawStatusBadge status={activeDraw.status} />
                    </div>
                    {!spinning && (
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <dt className="text-muted-foreground">Prize</dt>
                        <dd>{activeDraw.prizeNameSnapshot}</dd>
                        <dt className="text-muted-foreground">Ticket</dt>
                        <dd>{activeDraw.ticketNumberSnapshot ?? "—"}</dd>
                        <dt className="text-muted-foreground">Draw #</dt>
                        <dd>
                          {activeDraw.drawNumber} · from {activeDraw.eligiblePoolSize} eligible
                        </dd>
                        <dt className="text-muted-foreground">Drawn</dt>
                        <dd>
                          {formatTime(activeDraw.createdAt)} by {activeDraw.initiatedBy}
                        </dd>
                        {activeDraw.voidReason && (
                          <>
                            <dt className="text-muted-foreground">Void reason</dt>
                            <dd>{activeDraw.voidReason}</dd>
                          </>
                        )}
                      </dl>
                    )}
                  </div>
                  {!spinning && (
                    <div className="flex flex-wrap gap-2">
                      {["selected", "announced", "absent"].includes(activeDraw.status) && (
                        <Button onClick={() => act("confirm", () => drawAction(activeDraw, "confirm"), "Winner confirmed")} disabled={!!busy}>
                          <CheckCircle2 /> Confirm winner
                        </Button>
                      )}
                      {activeDraw.status === "confirmed" && (
                        <Button onClick={() => act("claim", () => drawAction(activeDraw, "claim"), "Prize marked as claimed")} disabled={!!busy}>
                          <Gift /> Mark prize claimed
                        </Button>
                      )}
                      {["selected", "announced", "confirmed"].includes(activeDraw.status) && (
                        <Button variant="outline" onClick={() => act("absent", () => drawAction(activeDraw, "absent"), "Marked absent")} disabled={!!busy}>
                          <UserX /> Mark absent
                        </Button>
                      )}
                      {!["claimed", "voided"].includes(activeDraw.status) && (
                        <Button variant="destructive" onClick={() => setVoidOpen(true)} disabled={!!busy}>
                          <Ban /> Void &amp; redraw
                        </Button>
                      )}
                    </div>
                  )}
                  {activeDraw.status === "voided" && (
                    <p className="rounded-lg bg-muted p-3 text-sm">
                      Draw voided and the prize returned to the pool — you can spin again. This person stays excluded unless you restore them on the{" "}
                      <Link href="/admin/participants" className="text-primary underline">
                        Participants
                      </Link>{" "}
                      page.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No winner on screen. Start a spin to draw one.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent draws</CardTitle>
              <Link href="/admin/history" className="text-sm text-primary hover:underline">
                Full history
              </Link>
            </CardHeader>
            <CardContent>
              {data.recentDraws.length === 0 ? (
                <p className="text-sm text-muted-foreground">No draws yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {data.recentDraws.map((d) => (
                    <li key={d.drawId} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">
                        <span className="text-muted-foreground">#{d.drawNumber}</span> <strong>{d.winnerNameSnapshot}</strong>{" "}
                        <span className="text-muted-foreground">· {d.prizeNameSnapshot}</span>
                      </span>
                      <DrawStatusBadge status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Void dialog */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this draw?</DialogTitle>
            <DialogDescription>
              The draw stays in the history as voided, the prize goes back to the pool, and {activeDraw?.winnerNameSnapshot ?? "the winner"} stays excluded from future
              draws. You can then spin again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Reason (required)</Label>
            <Textarea id="void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Not present after three calls" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={voidReason.trim().length < 3 || !!busy}
              onClick={() =>
                act(
                  "void",
                  async () => {
                    await drawAction(activeDraw!, "void", voidReason.trim());
                    setVoidOpen(false);
                    setVoidReason("");
                  },
                  "Draw voided — ready to redraw",
                )
              }
            >
              Void draw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Demo reset dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset demo data?</DialogTitle>
            <DialogDescription>
              Deletes all demo draws and restores 300 fictional attendees and the sample prizes. Production is never affected. Type <strong>{DEMO_PHRASE}</strong> to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Input value={resetText} onChange={(e) => setResetText(e.target.value)} aria-label="Confirmation phrase" placeholder={DEMO_PHRASE} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={resetText !== DEMO_PHRASE || !!busy}
              onClick={() =>
                act(
                  "reset",
                  async () => {
                    await raffle({ action: "reset-demo", confirmation: resetText });
                    setResetOpen(false);
                    setResetText("");
                  },
                  "Demo data reset",
                )
              }
            >
              Reset demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
