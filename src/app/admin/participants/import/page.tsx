import type { Metadata } from "next";
import { CsvImporter } from "@/components/admin/csv-importer";

// Behind the request-time organizer gate (see admin/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Import attendees" };

export default function ImportPage() {
  return <CsvImporter />;
}
