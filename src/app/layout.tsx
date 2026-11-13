import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin", "latin-ext"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Outfit({ variable: "--font-outfit", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "DevFest Toronto 2026: Spin the Wheel", template: "%s · DevFest Raffle" },
  description: "Fair, live raffle for DevFest Toronto 2026.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b1b3a" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
