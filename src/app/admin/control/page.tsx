import type { Metadata } from "next";
import { ControlPanel } from "@/components/admin/control-panel";

// Behind the request-time organizer gate (see admin/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Raffle control" };

export default function ControlPage() {
  return <ControlPanel />;
}
