import type { Metadata } from "next";
import { Overview } from "@/components/admin/overview";

// Behind the request-time organizer gate (see admin/layout.tsx).
export const instant = false;

export const metadata: Metadata = { title: "Organizer overview" };

export default function AdminHome() {
  return <Overview />;
}
