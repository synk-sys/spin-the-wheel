import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { authorizeCookie } from "@/lib/auth/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/admin-shell";

// Admin routes read the session on every request, so they block on the
// server rather than serving a prerendered shell (see Next.js
// "authentication with cache components").
export const instant = false;

/**
 * Every admin page is gated on the server. The API routes enforce the same
 * check independently, so a bypassed UI gate still can't perform actions.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-muted/30" />}>
      <OrganizerGate>{children}</OrganizerGate>
    </Suspense>
  );
}

async function OrganizerGate({ children }: { children: React.ReactNode }) {
  // Session checks depend on the current time and request: never prerender them.
  await connection();
  const jar = await cookies();
  const auth = await authorizeCookie(jar.get(SESSION_COOKIE)?.value);
  if (!auth.ok) redirect(auth.status === 401 ? "/login?next=/admin" : "/login?error=forbidden");
  return <AdminShell email={auth.actor.email}>{children}</AdminShell>;
}
