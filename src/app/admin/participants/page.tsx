import type { Metadata } from "next";
import { ParticipantsManager } from "@/components/admin/participants-manager";

// Behind the request-time organizer gate (see admin/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Participants" };

export default function ParticipantsPage() {
  return <ParticipantsManager />;
}
