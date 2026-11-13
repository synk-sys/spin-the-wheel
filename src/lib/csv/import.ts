import Papa from "papaparse";
import { participantInputSchema, type ParticipantInput } from "../domain/types";

export const IMPORT_FIELDS = ["attendeeId", "name", "email", "ticketNumber", "company"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Record<ImportField, number | null>;

export const MAX_IMPORT_ROWS = 2000;

const ALIASES: Record<ImportField, string[]> = {
  attendeeId: ["attendeeid", "attendee id", "id", "attendee", "attendee_id", "registrationid", "registration id", "order id"],
  name: ["name", "full name", "fullname", "attendee name", "participant", "participant name", "display name"],
  email: ["email", "e-mail", "email address", "mail", "emailaddress"],
  ticketNumber: ["ticketnumber", "ticket number", "ticket", "ticket #", "ticket no", "ticket_number", "ticket id", "ticketid", "badge"],
  company: ["company", "organization", "organisation", "employer", "org", "company name"],
};

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-.#]+/g, " ").trim();

function aliasMatch(header: string): ImportField | null {
  const h = norm(header);
  for (const f of IMPORT_FIELDS) {
    if (ALIASES[f].some((a) => norm(a) === h)) return f;
  }
  return null;
}

export interface ParsedCsv {
  /** Raw cell rows, excluding the header row when one was detected. */
  rows: string[][];
  headers: string[] | null;
  hasHeader: boolean;
  columnCount: number;
  /** Parser-level problems keyed by data-row index. */
  rowErrors: Map<number, string>;
  fatalError: string | null;
}

/** Strips a UTF-8 BOM and normalizes line endings. */
export function cleanCsvText(text: string): string {
  return text.replace(/^﻿/, "");
}

export function parseCsvText(text: string): ParsedCsv {
  const result = Papa.parse<string[]>(cleanCsvText(text), {
    header: false,
    skipEmptyLines: "greedy",
    transform: (v) => v,
  });
  const all = result.data.map((r) => r.map((c) => (c ?? "").toString()));
  if (all.length === 0) {
    return { rows: [], headers: null, hasHeader: false, columnCount: 0, rowErrors: new Map(), fatalError: "The file is empty." };
  }
  const first = all[0];
  const matched = first.filter((c) => aliasMatch(c) !== null).length;
  const hasHeader = matched >= 1 && first.every((c) => !looksLikeEmail(c));
  const headers = hasHeader ? first.map((h) => h.trim()) : null;
  const rows = hasHeader ? all.slice(1) : all;
  const columnCount = headers ? headers.length : Math.max(...all.map((r) => r.length));

  const rowErrors = new Map<number, string>();
  const offset = hasHeader ? 1 : 0;
  for (const e of result.errors) {
    if (typeof e.row === "number" && e.row - offset >= 0) rowErrors.set(e.row - offset, `Malformed CSV: ${e.message}`);
  }
  rows.forEach((r, i) => {
    const nonEmptyLen = trimTrailingEmpty(r).length;
    if (nonEmptyLen > columnCount) {
      rowErrors.set(i, `Malformed row: expected ${columnCount} columns, found ${nonEmptyLen}`);
    }
  });
  const fatalError = rows.length > MAX_IMPORT_ROWS ? `Too many rows (${rows.length}). The limit per import is ${MAX_IMPORT_ROWS}.` : null;
  return { rows, headers, hasHeader, columnCount, rowErrors, fatalError };
}

function trimTrailingEmpty(r: string[]): string[] {
  let end = r.length;
  while (end > 0 && r[end - 1].trim() === "") end--;
  return r.slice(0, end);
}

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Guesses a column mapping from headers, or from cell contents when there are none. */
export function detectMapping(parsed: ParsedCsv): ColumnMapping {
  const mapping: ColumnMapping = { attendeeId: null, name: null, email: null, ticketNumber: null, company: null };
  if (parsed.headers) {
    parsed.headers.forEach((h, i) => {
      const f = aliasMatch(h);
      if (f && mapping[f] === null) mapping[f] = i;
    });
    return mapping;
  }
  const sample = parsed.rows.slice(0, 50);
  for (let col = 0; col < parsed.columnCount; col++) {
    const values = sample.map((r) => (r[col] ?? "").trim()).filter(Boolean);
    if (values.length === 0) continue;
    if (mapping.email === null && values.every(looksLikeEmail)) mapping.email = col;
  }
  for (let col = 0; col < parsed.columnCount; col++) {
    if (col === mapping.email) continue;
    const values = sample.map((r) => (r[col] ?? "").trim()).filter(Boolean);
    if (mapping.name === null && values.some((v) => /[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]/.test(v))) mapping.name = col;
  }
  return mapping;
}

/** Removes control characters and collapses internal whitespace. */
export function sanitizeCell(v: string | undefined | null): string {
  return (v ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type RowIssue =
  | { kind: "invalid"; message: string }
  | { kind: "duplicate-in-file"; field: "attendeeId" | "email" | "ticketNumber"; ofRow: number }
  | { kind: "duplicate-existing"; field: "attendeeId" | "email" | "ticketNumber"; participantId: string };

export interface ReviewedRow {
  index: number;
  values: Record<ImportField, string>;
  data: ParticipantInput | null;
  issues: RowIssue[];
  /** Informational only — names are never used to merge or exclude. */
  sameNameAs: number[];
  /** Included by default only when valid and not a duplicate. */
  defaultInclude: boolean;
}

export interface ExistingKeys {
  attendeeIds: Map<string, string>;
  emails: Map<string, string>;
  ticketNumbers: Map<string, string>;
}

export function emptyExistingKeys(): ExistingKeys {
  return { attendeeIds: new Map(), emails: new Map(), ticketNumbers: new Map() };
}

export const keyOf = {
  attendeeId: (v: string) => v.trim().toLowerCase(),
  email: (v: string) => v.trim().toLowerCase(),
  ticketNumber: (v: string) => v.trim().toUpperCase(),
};

export function existingKeysFrom(
  participants: { participantId: string; attendeeId: string | null; email: string | null; ticketNumber: string | null; eligibilityStatus?: string }[],
): ExistingKeys {
  const k = emptyExistingKeys();
  for (const p of participants) {
    if (p.attendeeId) k.attendeeIds.set(keyOf.attendeeId(p.attendeeId), p.participantId);
    if (p.email) k.emails.set(keyOf.email(p.email), p.participantId);
    if (p.ticketNumber) k.ticketNumbers.set(keyOf.ticketNumber(p.ticketNumber), p.participantId);
  }
  return k;
}

export function rowsToValues(rows: string[][], mapping: ColumnMapping): Record<ImportField, string>[] {
  return rows.map((r) => {
    const out = {} as Record<ImportField, string>;
    for (const f of IMPORT_FIELDS) {
      const col = mapping[f];
      out[f] = col === null ? "" : sanitizeCell(r[col]);
    }
    return out;
  });
}

/**
 * Validates and deduplicates rows. Duplicates are detected on attendee ID,
 * email, and ticket number — never on name alone. The first occurrence in the
 * file wins; later occurrences and rows matching existing participants are
 * flagged and excluded by default so organizers can decide.
 */
export function reviewRows(
  values: Record<ImportField, string>[],
  existing: ExistingKeys = emptyExistingKeys(),
  parserErrors: Map<number, string> = new Map(),
): ReviewedRow[] {
  const seen = {
    attendeeId: new Map<string, number>(),
    email: new Map<string, number>(),
    ticketNumber: new Map<string, number>(),
  };
  const names = new Map<string, number[]>();
  const reviewed: ReviewedRow[] = values.map((v, index) => {
    const issues: RowIssue[] = [];
    const parserError = parserErrors.get(index);
    if (parserError) issues.push({ kind: "invalid", message: parserError });
    const parsed = participantInputSchema.safeParse(v);
    let data: ParticipantInput | null = null;
    if (parsed.success) data = parsed.data;
    else for (const iss of parsed.error.issues) issues.push({ kind: "invalid", message: `${iss.path.join(".") || "row"}: ${iss.message}` });

    if (data) {
      const ex: Record<"attendeeId" | "email" | "ticketNumber", Map<string, string>> = {
        attendeeId: existing.attendeeIds,
        email: existing.emails,
        ticketNumber: existing.ticketNumbers,
      };
      for (const field of ["attendeeId", "email", "ticketNumber"] as const) {
        const raw = data[field];
        if (!raw) continue;
        const key = keyOf[field](raw);
        const existingId = ex[field].get(key);
        if (existingId) issues.push({ kind: "duplicate-existing", field, participantId: existingId });
        const prior = seen[field].get(key);
        if (prior !== undefined) issues.push({ kind: "duplicate-in-file", field, ofRow: prior });
        else seen[field].set(key, index);
      }
      const nk = data.name.toLowerCase();
      names.set(nk, [...(names.get(nk) ?? []), index]);
    }
    return { index, values: v, data, issues, sameNameAs: [], defaultInclude: data !== null && issues.length === 0 };
  });
  for (const idxs of names.values()) {
    if (idxs.length > 1) for (const i of idxs) reviewed[i].sameNameAs = idxs.filter((j) => j !== i);
  }
  return reviewed;
}

export interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicateInFile: number;
  duplicateExisting: number;
  sameName: number;
}

export function summarize(rows: ReviewedRow[]): ImportSummary {
  return {
    total: rows.length,
    valid: rows.filter((r) => r.defaultInclude).length,
    invalid: rows.filter((r) => r.issues.some((i) => i.kind === "invalid")).length,
    duplicateInFile: rows.filter((r) => r.issues.some((i) => i.kind === "duplicate-in-file")).length,
    duplicateExisting: rows.filter((r) => r.issues.some((i) => i.kind === "duplicate-existing")).length,
    sameName: rows.filter((r) => r.sameNameAs.length > 0).length,
  };
}

export function describeIssue(issue: RowIssue): string {
  const label = { attendeeId: "attendee ID", email: "email", ticketNumber: "ticket number" } as const;
  switch (issue.kind) {
    case "invalid":
      return issue.message;
    case "duplicate-in-file":
      return `Duplicate ${label[issue.field]} (same as row ${issue.ofRow + 1})`;
    case "duplicate-existing":
      return `${label[issue.field][0].toUpperCase()}${label[issue.field].slice(1)} already imported`;
  }
}

/**
 * Stable fingerprint of the rows being imported. Used as the import's
 * idempotency key so the same file can't be imported twice by accident.
 */
export async function importFingerprint(rows: ParticipantInput[]): Promise<string> {
  const canonical = JSON.stringify(
    rows.map((r) => [r.attendeeId ?? "", r.name, (r.email ?? "").toLowerCase(), r.ticketNumber ?? "", r.company ?? ""]),
  );
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

export const CSV_TEMPLATE = "attendeeId,name,email,ticketNumber,company\n001,Alex Johnson,alex@example.com,DF001,Example Inc.\n002,Jordan Lee,jordan@example.com,DF002,\n";
