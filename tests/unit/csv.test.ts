import { describe, expect, it } from "vitest";
import {
  detectMapping,
  existingKeysFrom,
  parseCsvText,
  reviewRows,
  rowsToValues,
  summarize,
  importFingerprint,
} from "@/lib/csv/import";
import { neutralizeCell, toCsv } from "@/lib/csv/export";

function review(text: string) {
  const parsed = parseCsvText(text);
  const mapping = detectMapping(parsed);
  return { parsed, mapping, rows: reviewRows(rowsToValues(parsed.rows, mapping), undefined, parsed.rowErrors) };
}

describe("CSV parsing", () => {
  it("parses the documented example with a header", () => {
    const { parsed, mapping, rows } = review(
      "attendeeId,name,email,ticketNumber\n001,Alex Johnson,alex@example.com,DF001\n002,Jordan Lee,jordan@example.com,DF002\n003,Sam Patel,sam@example.com,DF003\n",
    );
    expect(parsed.hasHeader).toBe(true);
    expect(mapping).toEqual({ attendeeId: 0, name: 1, email: 2, ticketNumber: 3, company: null });
    expect(rows.map((r) => r.data?.name)).toEqual(["Alex Johnson", "Jordan Lee", "Sam Patel"]);
    expect(rows.every((r) => r.defaultInclude)).toBe(true);
    expect(rows[0].data?.attendeeId).toBe("001"); // leading zeros preserved
  });

  it("maps differently named headers via aliases", () => {
    const { mapping } = review("Full Name,E-mail,Ticket #,Organization\nAlex,alex@x.com,T1,Acme\n");
    expect(mapping).toEqual({ attendeeId: null, name: 0, email: 1, ticketNumber: 2, company: 3 });
  });

  it("handles quoting, escaped commas and quotes, UTF-8, BOM and whitespace", () => {
    const { rows } = review('﻿name,company\n"  Zoë ""Z"" Müller  ","Acme, Inc."\n  José Núñez ,  \n');
    expect(rows[0].data).toMatchObject({ name: 'Zoë "Z" Müller', company: "Acme, Inc." });
    expect(rows[1].data).toMatchObject({ name: "José Núñez", company: null });
  });

  it("detects headerless files by content", () => {
    const { parsed, mapping } = review("Alex Johnson,alex@example.com\nJordan Lee,jordan@example.com\n");
    expect(parsed.hasHeader).toBe(false);
    expect(mapping.email).toBe(1);
    expect(mapping.name).toBe(0);
  });

  it("flags missing names, bad emails, and malformed rows", () => {
    const { rows } = review("name,email\n,someone@example.com\nBad Email,not-an-email\nToo,many@x.com,extra,cols\n");
    expect(rows[0].issues[0]).toMatchObject({ kind: "invalid" });
    expect(rows[1].issues.some((i) => i.kind === "invalid" && i.message.includes("email"))).toBe(true);
    expect(rows[2].issues.some((i) => i.kind === "invalid" && i.message.includes("Malformed"))).toBe(true);
    expect(rows.every((r) => !r.defaultInclude)).toBe(true);
  });

  it("rejects an empty file", () => {
    expect(parseCsvText("").fatalError).toMatch(/empty/i);
  });

  it("handles 1,000 rows quickly", () => {
    const body = Array.from({ length: 1000 }, (_, i) => `${i},Person ${i},p${i}@x.com,T${i}`).join("\n");
    const t0 = performance.now();
    const { rows } = review(`attendeeId,name,email,ticketNumber\n${body}`);
    expect(rows).toHaveLength(1000);
    expect(summarize(rows).valid).toBe(1000);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe("duplicate detection", () => {
  it("flags duplicate attendee IDs, emails (case-insensitive) and ticket numbers within a file", () => {
    const { rows } = review(
      "attendeeId,name,email,ticketNumber\n1,A One,a@x.com,T1\n1,A Two,b@x.com,T2\n3,A Three,A@X.COM,T3\n4,A Four,d@x.com,t1\n",
    );
    expect(rows[0].defaultInclude).toBe(true);
    expect(rows[1].issues).toContainEqual({ kind: "duplicate-in-file", field: "attendeeId", ofRow: 0 });
    expect(rows[2].issues).toContainEqual({ kind: "duplicate-in-file", field: "email", ofRow: 0 });
    expect(rows[3].issues).toContainEqual({ kind: "duplicate-in-file", field: "ticketNumber", ofRow: 0 });
    expect(summarize(rows)).toMatchObject({ valid: 1, duplicateInFile: 3 });
  });

  it("never merges or excludes on name alone", () => {
    const { rows } = review("name,ticketNumber\nSam Patel,T1\nSam Patel,T2\n");
    expect(rows.every((r) => r.defaultInclude)).toBe(true);
    expect(rows[0].sameNameAs).toEqual([1]);
  });

  it("flags rows matching existing participants", () => {
    const existing = existingKeysFrom([{ participantId: "p_1", attendeeId: "001", email: "alex@example.com", ticketNumber: "DF001" }]);
    const parsed = parseCsvText("attendeeId,name,email\n001,Alex,new@x.com\n999,Other,ALEX@example.com\n");
    const rows = reviewRows(rowsToValues(parsed.rows, detectMapping(parsed)), existing);
    expect(rows[0].issues).toContainEqual({ kind: "duplicate-existing", field: "attendeeId", participantId: "p_1" });
    expect(rows[1].issues).toContainEqual({ kind: "duplicate-existing", field: "email", participantId: "p_1" });
  });

  it("produces a stable fingerprint for identical rows", async () => {
    const r = [{ attendeeId: "1", name: "A", email: "a@x.com", ticketNumber: null, company: null }];
    expect(await importFingerprint(r)).toBe(await importFingerprint([...r]));
    expect(await importFingerprint(r)).not.toBe(await importFingerprint([{ ...r[0], name: "B" }]));
  });
});

describe("CSV export", () => {
  it("neutralizes formula injection", () => {
    for (const bad of ["=HYPERLINK(\"x\")", "+1+1", "-2", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(neutralizeCell(bad).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(neutralizeCell("Alex")).toBe("Alex");
  });

  it("quotes commas, quotes and newlines and adds a BOM", () => {
    const csv = toCsv(["a", "b"], [["x, y", 'say "hi"']]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"x, y","say ""hi"""');
  });
});
