"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Download, Pencil, Plus, Search, Trash2, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiSend } from "@/lib/client/api";
import { useRaffleEnv } from "@/lib/client/env-context";
import { useApi } from "@/lib/client/use-api";
import type { EligibilityStatus, Participant } from "@/lib/domain/types";
import { NativeSelect, PageHeader, ParticipantStatusBadge, StatCard } from "./common";

type SortKey = "name" | "ticketNumber" | "eligibilityStatus" | "prizeName" | "createdAt";
const PAGE = 100;

interface FormState {
  attendeeId: string;
  name: string;
  email: string;
  ticketNumber: string;
  company: string;
}
const EMPTY: FormState = { attendeeId: "", name: "", email: "", ticketNumber: "", company: "" };

export function ParticipantsManager() {
  const { env } = useRaffleEnv();
  const { data, reload, loading } = useApi<{ participants: Participant[] }>("/api/admin/participants", env);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<EligibilityStatus | "all" | "active">("active");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "createdAt", dir: 1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Participant | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);

  const all = useMemo(() => data?.participants ?? [], [data]);
  const counts = useMemo(() => {
    const c = { eligible: 0, ineligible: 0, winner: 0, removed: 0 };
    for (const p of all) c[p.eligibilityStatus]++;
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = all.filter((p) => {
      if (status === "active" && p.eligibilityStatus === "removed") return false;
      if (status !== "all" && status !== "active" && p.eligibilityStatus !== status) return false;
      if (!needle) return true;
      return [p.name, p.email, p.ticketNumber, p.attendeeId, p.company].some((v) => v?.toLowerCase().includes(needle));
    });
    return rows.sort((a, b) => {
      const av = (a[sort.key] ?? "") as string | number;
      const bv = (b[sort.key] ?? "") as string | number;
      return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true })) * sort.dir;
    });
  }, [all, q, status, sort]);

  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }));
  const sortProps = { sort, onSort: toggleSort };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (p: Participant | "new") => {
    setEditing(p);
    setForm(
      p === "new"
        ? EMPTY
        : { attendeeId: p.attendeeId ?? "", name: p.name, email: p.email ?? "", ticketNumber: p.ticketNumber ?? "", company: p.company ?? "" },
    );
  };

  const save = () =>
    run(async () => {
      if (editing === "new") await apiSend("/api/admin/participants", env, "POST", { participant: form });
      else if (editing) await apiSend(`/api/admin/participants/${editing.participantId}`, env, "PATCH", { changes: form });
      setEditing(null);
    }, editing === "new" ? "Participant added" : "Participant updated");

  const setOne = (p: Participant, eligibilityStatus: "eligible" | "ineligible" | "removed", msg: string) =>
    run(() => apiSend(`/api/admin/participants/${p.participantId}`, env, "PATCH", { changes: { eligibilityStatus } }), msg);

  const bulk = (s: "eligible" | "ineligible") =>
    run(async () => {
      const r = await apiSend<{ updated: number; skipped: number }>("/api/admin/participants/bulk", env, "POST", { ids: [...selected], status: s });
      setSelected(new Set());
      if (r.skipped) toast.info(`${r.skipped} skipped (winners, removed, or already ${s}).`);
    }, `Updated eligibility`);

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((p) => selected.has(p.participantId));

  return (
    <div>
      <PageHeader
        title="Participants"
        description="Each eligible attendee has exactly one entry per draw until they win."
        actions={
          <>
            <Link href="/admin/participants/import">
              <Button variant="outline">
                <Upload /> Import CSV
              </Button>
            </Link>
            <a href={`/api/admin/participants/export?env=${env}`}>
              <Button variant="outline">
                <Download /> Export
              </Button>
            </a>
            <Button onClick={() => openEdit("new")}>
              <Plus /> Add participant
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total" value={all.length - counts.removed} hint={`${counts.removed} removed`} />
        <StatCard label="Eligible remaining" value={counts.eligible} accent="text-emerald-700" />
        <StatCard label="Winners" value={counts.winner} accent="text-g-blue" />
        <StatCard label="Ineligible" value={counts.ineligible} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name, email, ticket, attendee ID…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            aria-label="Search participants"
          />
        </div>
        <NativeSelect
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(0);
          }}
        >
          <option value="active">All (except removed)</option>
          <option value="eligible">Eligible</option>
          <option value="ineligible">Ineligible</option>
          <option value="winner">Winners</option>
          <option value="removed">Removed</option>
          <option value="all">Everything</option>
        </NativeSelect>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-2 py-1 text-sm">
            <span>{selected.size} selected</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => bulk("eligible")}>
              Make eligible
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => bulk("ineligible")}>
              Make ineligible
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  aria-label="Select all on this page"
                  checked={allOnPageSelected}
                  onCheckedChange={(v) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      pageRows.forEach((p) => (v ? n.add(p.participantId) : n.delete(p.participantId)));
                      return n;
                    })
                  }
                />
              </TableHead>
              <SortHead k="name" {...sortProps}>Name</SortHead>
              <SortHead k="ticketNumber" {...sortProps}>Ticket</SortHead>
              <TableHead>Attendee ID</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <SortHead k="eligibilityStatus" {...sortProps}>Status</SortHead>
              <SortHead k="prizeName" {...sortProps}>Prize won</SortHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((p) => (
              <TableRow key={p.participantId} data-state={selected.has(p.participantId) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${p.name}`}
                    checked={selected.has(p.participantId)}
                    onCheckedChange={(v) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (v) n.add(p.participantId);
                        else n.delete(p.participantId);
                        return n;
                      })
                    }
                  />
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="tabular-nums">{p.ticketNumber ?? "—"}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{p.attendeeId ?? "—"}</TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground">{p.email ?? "—"}</TableCell>
                <TableCell className="max-w-36 truncate text-muted-foreground">{p.company ?? "—"}</TableCell>
                <TableCell>
                  <ParticipantStatusBadge status={p.eligibilityStatus} />
                  {p.ineligibleReason === "voided-draw" && <span className="ml-1 text-xs text-muted-foreground">(voided draw)</span>}
                </TableCell>
                <TableCell>{p.prizeName ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => openEdit(p)} disabled={busy}>
                      <Pencil />
                    </Button>
                    {p.eligibilityStatus === "removed" || (p.eligibilityStatus === "ineligible" && p.ineligibleReason === "voided-draw") ? (
                      <Button size="sm" variant="ghost" onClick={() => setOne(p, "eligible", `${p.name} is eligible again`)} disabled={busy}>
                        <Undo2 /> Restore
                      </Button>
                    ) : p.eligibilityStatus !== "winner" ? (
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${p.name}`} onClick={() => setOne(p, "removed", `${p.name} removed`)} disabled={busy}>
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  {all.length === 0 ? (
                    <>
                      No participants yet. <Link href="/admin/participants/import" className="text-primary underline">Import a CSV</Link> to get started.
                    </>
                  ) : (
                    "No participants match these filters."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {filtered.length === 0 ? 0 : page * PAGE + 1}–{Math.min(filtered.length, (page + 1) * PAGE)} of {filtered.length}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add participant" : "Edit participant"}</DialogTitle>
            <DialogDescription>Only the name is required. Attendee ID, email and ticket number must be unique.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {(
              [
                ["name", "Name *"],
                ["ticketNumber", "Ticket number"],
                ["attendeeId", "Attendee ID"],
                ["email", "Email"],
                ["company", "Company"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`f-${k}`}>{label}</Label>
                <Input id={`f-${k}`} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} type={k === "email" ? "email" : "text"} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || form.name.trim() === ""}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortHead({ k, sort, onSort, children }: { k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; children: string }) {
  return (
    <TableHead>
      <button className="inline-flex items-center gap-1 font-medium" onClick={() => onSort(k)} aria-label={`Sort by ${children}`}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  );
}
