"use client";

import { useEffect } from "react";

/** Projector error boundary: shows a calm screen and retries automatically. */
export default function DisplayError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    const t = setTimeout(() => retry(), 5000);
    return () => clearTimeout(t);
  }, [error, retry]);
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#050b1a] font-display text-white">
      <p className="text-4xl font-bold">DevFest Toronto 2026 Raffle</p>
      <p className="mt-4 text-xl text-white/70">Reconnecting to the raffle…</p>
    </div>
  );
}
