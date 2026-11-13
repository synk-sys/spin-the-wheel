"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, LogIn } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function safeNext(next: string | null) {
  return next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
}

export function LoginForm({ devAuth, firebaseConfigured }: { devAuth: boolean; firebaseConfigured: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(params.get("error") === "forbidden" ? "This account is not an authorized organizer." : null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const next = safeNext(params.get("next"));

  const finish = async (res: Response) => {
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error?.message ?? "Sign-in failed");
    router.replace(next);
    router.refresh();
  };

  const google = async () => {
    setBusy(true);
    setError(null);
    try {
      const { firebaseClientApp } = await import("@/lib/firebase/client");
      const { getAuth, GoogleAuthProvider, signInWithPopup, signOut } = await import("firebase/auth");
      const app = firebaseClientApp();
      if (!app) throw new Error("Firebase is not configured.");
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await signInWithPopup(auth, provider);
      const idToken = await cred.user.getIdToken(true);
      const res = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
      // The server session cookie is the source of truth; drop the client session.
      await signOut(auth);
      await finish(res);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("popup-closed") ? "Sign-in was cancelled." : msg);
    } finally {
      setBusy(false);
    }
  };

  const dev = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/dev-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      await finish(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center text-center">
        <BrandMark className="mx-auto mb-2 size-16" />
        <CardTitle className="font-display text-2xl">Organizer sign-in</CardTitle>
        <CardDescription>DevFest Toronto 2026 · Spin the Wheel</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Can&apos;t sign in</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {firebaseConfigured ? (
          <Button className="h-11 w-full text-base" onClick={google} disabled={busy}>
            <LogIn /> Sign in with Google
          </Button>
        ) : (
          !devAuth && (
            <Alert>
              <AlertTriangle />
              <AlertTitle>Firebase is not configured</AlertTitle>
              <AlertDescription>Set the NEXT_PUBLIC_FIREBASE_* variables (see README) to enable Google sign-in.</AlertDescription>
            </Alert>
          )
        )}
        {devAuth && (
          <>
            {firebaseConfigured && <Separator />}
            <form onSubmit={dev} className="space-y-3" aria-label="Local development sign-in">
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                <strong>Local development login.</strong> Enabled by AUTH_MODE=dev and impossible in production builds. The email must be in ORGANIZER_EMAILS.
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dev-email">Organizer email</Label>
                <Input id="dev-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="organizer@example.com" />
              </div>
              <Button type="submit" variant="outline" className="w-full" disabled={busy}>
                Continue (dev)
              </Button>
            </form>
          </>
        )}
        <p className="text-center text-xs text-muted-foreground">Only allowlisted organizer accounts can access the dashboard.</p>
      </CardContent>
    </Card>
  );
}
