import type { Metadata } from "next";
import { Suspense } from "react";
import { DisplayScreen } from "@/components/display/display-screen";

export const metadata: Metadata = { title: "Projector" };

/** Public projector view. ?env=demo shows the demo raffle (clearly labeled). */
export default function DisplayPage({ searchParams }: PageProps<"/display">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#050b1a]" />}>
      <DisplayFromParams searchParams={searchParams} />
    </Suspense>
  );
}

async function DisplayFromParams({ searchParams }: { searchParams: PageProps<"/display">["searchParams"] }) {
  const sp = await searchParams;
  const env = sp.env === "demo" ? "demo" : "production";
  return <DisplayScreen env={env} />;
}
