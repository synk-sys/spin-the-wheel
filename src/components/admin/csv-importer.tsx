"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiSend, downloadText } from "@/lib/client/api";
import { useRaffleEnv } from "@/lib/client/env-context";
import { useApi } from "@/lib/client/use-api";
import {
  CSV_TEMPLATE,
  describeIssue,
  detectMapping,
  existingKeysFrom,
  IMPORT_FIELDS,
  parseCsvText,
  reviewRows,
  rowsToValues,
  summarize,
  type ColumnMapping,
  type ImportField,
  type ParsedCsv,
} from "@/lib/csv/import";
import type { Participant } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { NativeSelect, PageHeader, StatCard } from "./common";

const FIELD_LABEL: Record<ImportField, string> = {
  attendeeId: "Attendee ID",
  name: "Name *",
  email: "Email",
  ticketNumber: "Ticket number",
  company: "Company",
};

type Filter = "all" | "issues" | "included" | "excluded";
const PREVIEW_LIMIT = 250;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function CsvImporter() {
  const { env } = useRaffleEnv();
  const existing = useApi<{ participants: Participant[] }>("/api/admin/participants", env);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [edits, setEdits] = useState<Map<number, Partial<Record<ImportField, string>>>>(new Map());
  const [include, setInclude] = useState<Map<number, boolean>>(new Map());
  const [filter, setFilter] = useState<Filter>("all");
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const existingKeys = useMemo(() => existingKeysFrom(existing.data?.participants ?? []), [existing.data]);

  const values = useMemo(() => {
    if (!parsed || !mapping) return [];
    return rowsToValues(parsed.rows, mapping).map((v, i) => ({ ...v, ...(edits.get(i) ?? {}) }));
  }, [parsed, mapping, edits]);

  const reviewed = useMemo(() => reviewRows(values, existingKeys, parsed?.rowErrors), [values, existingKeys, parsed]);
  const summary = summarize(reviewed);
  const isIncluded = (i: number) => include.get(i) ?? reviewed[i].defaultInclude;
  const includedRows = reviewed.filter((r) => r.data && isIncluded(r.index));
  const overridden = includedRows.filter((r) => !r.defaultInclude);

  const visible = reviewed.filter((r) => {
    if (filter === "issues") return r.issues.length > 0 || r.sameNameAs.length > 0;
    if (filter === "included") return isIncluded(r.index);
    if (filter === "excluded") return !isIncluded(r.index);
    return true;
  });

  const load = async (file: File) => {
    setResult(null);
    if (!/\.(csv|txt)$/i.test(file.name) && file.type !== "text/csv") {
      toast.error("Please choose a .csv file");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("File is larger than 5 MB");
      return;
    }
    const text = await file.text(); // File.text() decodes as UTF-8
    const p = parseCsvText(text);
    if (p.fatalError) {
      toast.error(p.fatalError);
      return;
    }
    setFileName(file.name);
    setParsed(p);
    setMapping(detectMapping(p));
    setEdits(new Map());
    setInclude(new Map());
    setFilter("all");
  };

  const setCell = (i: number, field: ImportField, value: string) =>
    setEdits((m) => {
      const n = new Map(m);
      n.set(i, { ...(n.get(i) ?? {}), [field]: value });
      return n;
    });

  const submit = async () => {
    setSubmitting(true);
    try {
      const rows = includedRows.map((r) => r.data!);
      const overrideDuplicates = includedRows.flatMap((r, sentIndex) => (r.defaultInclude ? [] : [sentIndex]));
      const res = await apiSend<{ imported: number; skipped: { index: number }[] }>("/api/admin/participants/import", env, "POST", {
        rows,
        fileName,
        overrideDuplicates,
      });
      setResult({ imported: res.imported, skipped: res.skipped.length });
      setConfirming(false);
      toast.success(`Imported ${res.imported} participants`);
      await existing.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Import failed — nothing was imported.");
    } finally {
      setSubmitting(false);
    }
  };

  const columnOptions = parsed
    ? Array.from({ length: parsed.columnCount }, (_, i) => ({
        i,
        label: parsed.headers?.[i] ? `${parsed.headers[i]} (col ${i + 1})` : `Column ${i + 1}${parsed.rows[0]?.[i] ? ` — e.g. "${parsed.rows[0][i].slice(0, 20)}"` : ""}`,
      }))
    : [];

  return (
    <div>
      <PageHeader
        title="Import attendees"
        description={`Importing into the ${env === "demo" ? "DEMO" : "PRODUCTION"} raffle. Up to 2,000 rows per file.`}
        actions={
          <Button variant="outline" onClick={() => downloadText("devfest-raffle-template.csv", CSV_TEMPLATE)}>
            <Download /> CSV template
          </Button>
        }
      />

      {result && (
        <Alert className="mb-6 border-emerald-300 bg-emerald-50">
          <CheckCircle2 className="text-emerald-700" />
          <AlertTitle>Import complete</AlertTitle>
          <AlertDescription>
            {result.imported} participants imported{result.skipped ? `, ${result.skipped} rows skipped` : ""}. Total participants now:{" "}
            {(existing.data?.participants ?? []).filter((p) => p.eligibilityStatus !== "removed").length}.{" "}
            <Link href="/admin/participants" className="font-medium underline">
              View participants
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Step 1: upload */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>1. Choose a CSV file</CardTitle>
          <CardDescription>Columns: name (required), attendeeId, email, ticketNumber, company. Headers are detected automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) void load(f);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
            )}
            data-testid="csv-dropzone"
          >
            {fileName ? <FileSpreadsheet className="size-10 text-g-green" /> : <Upload className="size-10 text-muted-foreground" />}
            <p className="mt-3 font-medium">{fileName ?? "Drag & drop a CSV here, or click to browse"}</p>
            {parsed && <p className="text-sm text-muted-foreground">{parsed.rows.length} data rows · {parsed.hasHeader ? "header detected" : "no header row detected"}</p>}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              data-testid="csv-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void load(f);
                e.target.value = "";
              }}
            />
          </div>
        </CardContent>
      </Card>

      {parsed && mapping && (
        <>
          {/* Step 2: mapping */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>2. Check column mapping</CardTitle>
              <CardDescription>Adjust if your headers are named differently.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {IMPORT_FIELDS.map((f) => (
                <label key={f} className="space-y-1 text-sm">
                  <span className="font-medium">{FIELD_LABEL[f]}</span>
                  <NativeSelect
                    className="w-full"
                    value={mapping[f] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [f]: e.target.value === "" ? null : Number(e.target.value) })}
                    aria-label={`Column for ${FIELD_LABEL[f]}`}
                  >
                    <option value="">— not in file —</option>
                    {columnOptions.map((o) => (
                      <option key={o.i} value={o.i}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ))}
              {mapping.name === null && <p className="text-sm text-destructive sm:col-span-full">Choose which column holds the attendee name.</p>}
            </CardContent>
          </Card>

          {/* Step 3: review */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>3. Review &amp; fix rows</CardTitle>
              <CardDescription>
                Duplicates are matched on attendee ID, email, and ticket number — never on name alone. Duplicates and invalid rows are excluded unless you include them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6" data-testid="import-summary">
                <StatCard label="Rows" value={summary.total} />
                <StatCard label="Ready" value={summary.valid} accent="text-emerald-700" />
                <StatCard label="Invalid" value={summary.invalid} accent={summary.invalid ? "text-destructive" : undefined} />
                <StatCard label="Dupes in file" value={summary.duplicateInFile} accent={summary.duplicateInFile ? "text-amber-700" : undefined} />
                <StatCard label="Already imported" value={summary.duplicateExisting} accent={summary.duplicateExisting ? "text-amber-700" : undefined} />
                <StatCard label="Shared names" value={summary.sameName} hint="Kept — told apart by ticket" />
              </div>

              <div className="mb-3 flex flex-wrap gap-1" role="tablist">
                {(["all", "issues", "included", "excluded"] as Filter[]).map((f) => (
                  <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
                    {f}
                  </Button>
                ))}
              </div>

              <div className="max-h-[560px] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-10">Use</TableHead>
                      <TableHead className="w-12">Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Attendee ID</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.slice(0, PREVIEW_LIMIT).map((r) => {
                      const editable = r.issues.length > 0;
                      const invalid = r.issues.some((i) => i.kind === "invalid");
                      return (
                        <TableRow key={r.index} className={cn(invalid && "bg-red-50/60", !invalid && r.issues.length > 0 && "bg-amber-50/60")}>
                          <TableCell>
                            <Checkbox
                              aria-label={`Include row ${r.index + 1}`}
                              checked={isIncluded(r.index) && !!r.data}
                              disabled={!r.data}
                              onCheckedChange={(v) => setInclude((m) => new Map(m).set(r.index, !!v))}
                            />
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{r.index + 1}</TableCell>
                          {(["name", "email", "ticketNumber", "attendeeId"] as const).map((f) => (
                            <TableCell key={f}>
                              {editable ? (
                                <Input
                                  className="h-7 min-w-28"
                                  value={r.values[f]}
                                  onChange={(e) => setCell(r.index, f, e.target.value)}
                                  aria-label={`Row ${r.index + 1} ${f}`}
                                />
                              ) : (
                                r.values[f] || <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          ))}
                          <TableCell className="text-xs">
                            {r.issues.map((i, k) => (
                              <p key={k} className={i.kind === "invalid" ? "text-destructive" : "text-amber-800"}>
                                {describeIssue(i)}
                              </p>
                            ))}
                            {r.sameNameAs.length > 0 && <p className="text-muted-foreground">Same name as row {r.sameNameAs.map((n) => n + 1).join(", ")} (kept)</p>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {visible.length > PREVIEW_LIMIT && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing the first {PREVIEW_LIMIT} of {visible.length} rows. Use the &quot;issues&quot; filter to focus on rows that need attention.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{includedRows.length}</strong> rows will be imported
              {overridden.length > 0 && ` (including ${overridden.length} duplicate${overridden.length === 1 ? "" : "s"} you chose to keep)`}.
            </p>
            <Button size="lg" disabled={includedRows.length === 0 || mapping.name === null} onClick={() => setConfirming(true)} data-testid="import-continue">
              Import {includedRows.length} participants
            </Button>
          </div>
        </>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import {includedRows.length} participants?</DialogTitle>
            <DialogDescription>
              Into the <strong>{env === "demo" ? "demo" : "production"}</strong> raffle. The server re-checks every row and will refuse to import the same file twice.
            </DialogDescription>
          </DialogHeader>
          {env === "production" && (
            <Alert>
              <AlertTriangle />
              <AlertDescription>This adds real attendees to the live raffle. They become eligible immediately.</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting} data-testid="import-confirm">
              {submitting && <Loader2 className="animate-spin" />} Confirm import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
