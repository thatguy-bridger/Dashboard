import type { Metadata, Viewport } from "next";
import { Figtree, Nunito, DM_Sans, Quicksand } from "next/font/google";
import "./globals.css";

// Self-hosted by next/font (downloaded at build time, served from our own domain: no layout shift, no third-party request on the Fire TV).
// Pairing A (used): Figtree for words, Nunito for numerals (it has tabular figures, so a ticking clock never jitters). Calm weights only: 400 to 600.
const textA = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--nf-text-a", display: "swap" });
const numA = Nunito({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--nf-num-a", display: "swap" });
// Pairing B (candidate, only loaded for local previews: ?font=b): DM Sans + Quicksand.
const textB = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--nf-text-b", display: "swap" });
const numB = Quicksand({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--nf-num-b", display: "swap" });

export const metadata: Metadata = { title: "Home", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0f0e13", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

const PREVIEW = process.env.NEXT_PUBLIC_DASH_MOCK === "1";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cls = [textA.variable, numA.variable, ...(PREVIEW ? [textB.variable, numB.variable] : [])].join(" ");
  return (<html lang="en" className={cls}><body>{children}</body></html>);
}
