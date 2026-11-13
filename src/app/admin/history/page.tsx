import type { Metadata } from "next";
import { HistoryView } from "@/components/admin/history-view";

// Behind the request-time organizer gate (see admin/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Winner history" };

export default function HistoryPage() {
  return <HistoryView />;
}
