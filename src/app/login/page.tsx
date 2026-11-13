import type { Metadata } from "next";
import { Suspense } from "react";
import { isDevAuthEnabled } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Organizer sign-in" };

export default function LoginPage() {
  const firebaseConfigured = !!(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,#e8f0fe,transparent_60%)] px-4 py-12">
      <Suspense>
        <LoginForm devAuth={isDevAuthEnabled()} firebaseConfigured={firebaseConfigured} />
      </Suspense>
    </main>
  );
}
