"use client";

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">{error.message || "Unexpected error."}</p>
      <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => retry()}>
        Try again
      </button>
    </main>
  );
}
