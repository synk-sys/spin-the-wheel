import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="font-display text-3xl font-bold">Page not found</h1>
      <Link href="/" className="text-primary underline">
        Back to start
      </Link>
    </main>
  );
}
