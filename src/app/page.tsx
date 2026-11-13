import Link from "next/link";
import { MonitorPlay, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0b1b3a] px-4 py-16 text-white">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-g-blue opacity-30 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-g-green opacity-20 blur-3xl" />
      <div className="relative flex max-w-2xl flex-col items-center text-center">
        <BrandMark className="size-24" />
        <p className="mt-6 font-display text-sm font-semibold uppercase tracking-[0.3em] text-white/70">DevFest Toronto 2026</p>
        <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight sm:text-6xl">
          Spin the Wheel <span className="text-g-yellow">Raffle</span>
        </h1>
        <p className="mt-4 text-lg text-white/75">One colorful wheel. Hundreds of attendees. Fair winners.</p>
        <div className="mt-10 grid w-full gap-4 sm:grid-cols-2">
          <Link href="/admin" className="group rounded-2xl bg-white p-6 text-left text-[#202124] shadow-xl transition hover:-translate-y-0.5">
            <ShieldCheck className="size-8 text-g-blue" />
            <p className="mt-3 font-display text-xl font-bold">Organizer dashboard</p>
            <p className="mt-1 text-sm text-[#5f6368]">Sign in to import attendees, set up prizes, and run the raffle.</p>
          </Link>
          <Link href="/display" className="group rounded-2xl bg-white/10 p-6 text-left ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:bg-white/15">
            <MonitorPlay className="size-8 text-g-yellow" />
            <p className="mt-3 font-display text-xl font-bold">Projector display</p>
            <p className="mt-1 text-sm text-white/70">Open on the projector laptop. Read-only, no private data.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
