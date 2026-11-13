/**
 * CSV export with formula-injection protection.
 *
 * Spreadsheet apps execute cells beginning with = + - @ (and tab/CR). Such
 * values are prefixed with a single quote so they are shown as text.
 * See OWASP "CSV Injection".
 */
export function neutralizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(neutralizeCell).join(","), ...rows.map((r) => r.map(neutralizeCell).join(","))];
  // BOM so Excel opens UTF-8 names correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
