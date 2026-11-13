"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto mt-24 max-w-md rounded-xl border bg-card p-6 text-center">
      <AlertTriangle className="mx-auto size-8 text-destructive" />
      <h2 className="mt-3 text-lg font-semibold">This page hit an error</h2>
      <p className="mt-1 text-sm text-muted-foreground">{error.message || "Unexpected error."} Raffle data is safe — failed actions are not saved.</p>
      <Button className="mt-4" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
