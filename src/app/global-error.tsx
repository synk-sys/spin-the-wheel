"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#0b1b3a", color: "#fff" }}>
        <div style={{ textAlign: "center" }}>
          <h1>DevFest Toronto 2026 Raffle</h1>
          <p>Something went wrong loading the app.</p>
          <button onClick={() => retry()} style={{ padding: "8px 16px", borderRadius: 8, border: 0, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
