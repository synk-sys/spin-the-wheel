/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

const LOGO = process.env.NEXT_PUBLIC_BRAND_LOGO_URL || "/branding/devfest-toronto-2026.svg";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-black/5", className)}>
      <img src={LOGO} alt="DevFest Toronto 2026" className="h-full w-full object-contain" />
    </span>
  );
}
