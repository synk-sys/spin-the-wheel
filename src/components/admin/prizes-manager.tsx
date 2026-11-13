"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CheckCheck, Gift, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiSend } from "@/lib/client/api";
import { useRaffleEnv } from "@/lib/client/env-context";
import { useApi } from "@/lib/client/use-api";
import type { Draw, Prize, PrizeStatus } from "@/lib/domain/types";
import { DrawStatusBadge, PageHeader, PrizeStatusBadge } from "./common";

interface FormState {
  name: string;
  description: string;
  imageUrl: string;
  quantity: string;
}
const EMPTY: FormState = { name: "", description: "", imageUrl: "", quantity: "1" };

export function PrizesManager() {
  const { env } = useRaffleEnv();
  const prizes = useApi<{ prizes: Prize[] }>("/api/admin/prizes", env);
  const draws = useApi<{ draws: Draw[] }>("/api/admin/draws", env);
  const [editing, setEditing] = useState<Prize | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const list = prizes.data?.prizes ?? [];

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await Promise.all([prizes.reload(), draws.reload()]);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (p: Prize | "new") => {
    setEditing(p);
    setForm(p === "new" ? EMPTY : { name: p.name, description: p.description, imageUrl: p.imageUrl ?? "", quantity: String(p.quantity) });
  };

  const save = () =>
    run(async () => {
      const payload = { ...form, quantity: Number(form.quantity) };
      if (editing === "new") await apiSend("/api/admin/prizes", env, "POST", { prize: payload });
      else if (editing) await apiSend(`/api/admin/prizes/${editing.prizeId}`, env, "PATCH", { changes: payload });
      setEditing(null);
    }, "Prize saved");

  const move = (index: number, delta: -1 | 1) => {
    const order = list.map((p) => p.prizeId);
    const j = index + delta;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    return run(() => apiSend("/api/admin/prizes/reorder", env, "POST", { order }), "Order updated");
  };

  const setStatus = (p: Prize, status: PrizeStatus, msg: string) =>
    run(() => apiSend(`/api/admin/prizes/${p.prizeId}`, env, "PATCH", { changes: { status } }), msg);

  return (
    <div>
      <PageHeader
        title="Prizes"
        description={env === "demo" ? "Sample prizes for practice — replace them freely." : "Prize rounds are drawn in this order."}
        actions={
          <Button onClick={() => openEdit("new")}>
            <Plus /> Add prize
          </Button>
        }
      />

      <div className="space-y-3">
        {list.map((p, i) => {
          const winners = (draws.data?.draws ?? []).filter((d) => d.prizeId === p.prizeId);
          const awarded = p.quantity - p.remainingQuantity;
          return (
            <Card key={p.prizeId}>
              <CardContent className="flex flex-wrap items-start gap-4">
                <div className="flex flex-col gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label={`Move ${p.name} up`} disabled={i === 0 || busy} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <span className="text-center text-sm font-semibold tabular-nums text-muted-foreground">{p.drawOrder}</span>
                  <Button size="icon-sm" variant="ghost" aria-label={`Move ${p.name} down`} disabled={i === list.length - 1 || busy} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                </div>
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-full object-cover" /> : <Gift className="size-7 text-g-red" />}
                </div>
                <div className="min-w-48 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-bold">{p.name}</h3>
                    <PrizeStatusBadge status={p.status} />
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                  <p className="mt-1 text-sm">
                    <strong className="tabular-nums">{p.remainingQuantity}</strong> of {p.quantity} remaining · {awarded} drawn
                  </p>
                  {winners.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                      {winners.map((d) => (
                        <li key={d.drawId} className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5">
                          #{d.drawNumber} {d.winnerNameSnapshot} <DrawStatusBadge status={d.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => openEdit(p)} disabled={busy}>
                    <Pencil /> Edit
                  </Button>
                  {p.status === "awarded" || p.status === "claimed" ? (
                    <>
                      {p.status === "awarded" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(p, "claimed", "Marked claimed")} disabled={busy}>
                          <CheckCheck /> Mark claimed
                        </Button>
                      )}
                      {p.remainingQuantity > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => setStatus(p, "in_progress", "Prize reopened")} disabled={busy}>
                          <RotateCcw /> Reopen
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setStatus(p, "awarded", "Marked awarded")} disabled={busy}>
                      <CheckCheck /> Mark awarded
                    </Button>
                  )}
                  {p.drawCount === 0 && (
                    <Button size="sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => run(() => apiSend(`/api/admin/prizes/${p.prizeId}`, env, "DELETE"), "Prize deleted")} disabled={busy}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!prizes.loading && list.length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No prizes yet. Add the first prize round.</div>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add prize" : "Edit prize"}</DialogTitle>
            <DialogDescription>Quantity is how many winners this prize gets. It can&apos;t go below the number already drawn.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="p-name">Prize name *</Label>
              <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-desc">Description</Label>
              <Textarea id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-img">Image URL (optional)</Label>
              <Input id="p-img" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://… or /prizes/hoodie.png" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-qty">Quantity *</Label>
              <Input id="p-qty" type="number" min={1} max={500} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !form.name.trim() || Number(form.quantity) < 1}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
