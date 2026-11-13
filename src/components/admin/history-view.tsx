"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRaffleEnv } from "@/lib/client/env-context";
import { useApi } from "@/lib/client/use-api";
import { DRAW_STATUSES, type AuditLog, type Draw, type DrawStatus } from "@/lib/domain/types";
import { DrawStatusBadge, formatTime, NativeSelect, PageHeader, StatCard } from "./common";

export function HistoryView() {
  const { env } = useRaffleEnv();
  const draws = useApi<{ draws: Draw[] }>("/api/admin/draws", env, 5000);
  const audit = useApi<{ events: AuditLog[] }>("/api/admin/audit", env);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<DrawStatus | "all">("all");
  const [prize, setPrize] = useState("all");
  const [desc, setDesc] = useState(false);
  const [auditQ, setAuditQ] = useState("");

  const list = useMemo(() => draws.data?.draws ?? [], [draws.data]);
  const prizeNames = useMemo(() => [...new Set(list.map((d) => d.prizeNameSnapshot))], [list]);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const rows = list.filter(
      (d) =>
        (status === "all" || d.status === status) &&
        (prize === "all" || d.prizeNameSnapshot === prize) &&
        (!n || [d.winnerNameSnapshot, d.ticketNumberSnapshot, d.prizeNameSnapshot, d.initiatedBy, d.voidReason].some((v) => v?.toLowerCase().includes(n))),
    );
    return desc ? [...rows].reverse() : rows;
  }, [list, q, status, prize, desc]);

  const events = (audit.data?.events ?? []).filter((e) => {
    const n = auditQ.trim().toLowerCase();
    return !n || [e.eventType, e.organizerId, e.entityId ?? "", JSON.stringify(e.details)].some((v) => v.toLowerCase().includes(n));
  });

  const valid = list.filter((d) => d.status !== "voided");

  return (
    <div>
      <PageHeader
        title="Winner history"
        description={`Immutable record of every draw in the ${env} raffle. Status changes are appended, never overwritten.`}
        actions={
          <>
            <a href={`/api/admin/draws/export?env=${env}`}>
              <Button variant="outline">
                <Download /> Export CSV
              </Button>
            </a>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Print report
            </Button>
          </>
        }
      />

      <div className="mb-4 hidden print:block">
        <h2 className="text-xl font-bold">DevFest Toronto 2026 — Raffle winner report ({env})</h2>
        <p className="text-sm">Generated {new Date().toLocaleString()}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total draws" value={list.length} />
        <StatCard label="Valid winners" value={valid.length} accent="text-g-blue" />
        <StatCard label="Claimed" value={list.filter((d) => d.status === "claimed").length} accent="text-emerald-700" />
        <StatCard label="Voided" value={list.filter((d) => d.status === "voided").length} />
      </div>

      <Tabs defaultValue="draws">
        <TabsList className="no-print">
          <TabsTrigger value="draws">Draws</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="draws">
          <div className="no-print my-3 flex flex-wrap gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search winner, ticket, prize, organizer…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search draws" />
            </div>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as DrawStatus | "all")} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {DRAW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={prize} onChange={(e) => setPrize(e.target.value)} aria-label="Filter by prize">
              <option value="all">All prizes</option>
              {prizeNames.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button className="inline-flex items-center gap-1" onClick={() => setDesc((d) => !d)} aria-label="Toggle sort order">
                      # {desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
                    </button>
                  </TableHead>
                  <TableHead>Prize</TableHead>
                  <TableHead>Winner</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Drawn at</TableHead>
                  <TableHead>Organizer</TableHead>
                  <TableHead className="text-right">Pool</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Claim</TableHead>
                  <TableHead>Void reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.drawId} className={d.status === "voided" ? "text-muted-foreground" : undefined}>
                    <TableCell className="tabular-nums">{d.drawNumber}</TableCell>
                    <TableCell>{d.prizeNameSnapshot}</TableCell>
                    <TableCell className="font-medium">{d.winnerNameSnapshot}</TableCell>
                    <TableCell className="tabular-nums">{d.ticketNumberSnapshot ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatTime(d.createdAt)}</TableCell>
                    <TableCell className="max-w-40 truncate">{d.initiatedBy}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.eligiblePoolSize}</TableCell>
                    <TableCell>
                      <DrawStatusBadge status={d.status} />
                    </TableCell>
                    <TableCell>{d.status === "claimed" ? `Claimed ${formatTime(d.claimedAt)}` : d.status === "voided" ? "—" : "Unclaimed"}</TableCell>
                    <TableCell className="max-w-48">{d.voidReason ?? ""}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                      {list.length === 0 ? "No draws yet." : "No draws match these filters."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="audit">
          <div className="my-3">
            <Input placeholder="Search events…" value={auditQ} onChange={(e) => setAuditQ(e.target.value)} aria-label="Search audit log" />
          </div>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Organizer</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.eventId}>
                    <TableCell className="whitespace-nowrap">{formatTime(e.timestamp)}</TableCell>
                    <TableCell className="font-mono text-xs">{e.eventType}</TableCell>
                    <TableCell className="max-w-40 truncate">{e.organizerId}</TableCell>
                    <TableCell className="max-w-32 truncate font-mono text-xs">{e.entityId ?? "—"}</TableCell>
                    <TableCell className="max-w-md truncate font-mono text-xs" title={JSON.stringify(e.details)}>
                      {JSON.stringify(e.details)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
