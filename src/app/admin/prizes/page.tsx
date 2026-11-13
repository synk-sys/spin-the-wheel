import type { Metadata } from "next";
import { PrizesManager } from "@/components/admin/prizes-manager";

// Behind the request-time organizer gate (see admin/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Prizes" };

export default function PrizesPage() {
  return <PrizesManager />;
}
