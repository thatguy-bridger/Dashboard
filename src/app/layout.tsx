import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are bundled in the repo (src/fonts, variable woff2, Latin subset) so a build never depends on downloading them.
// Pairing A (used): Figtree for words, Nunito for numerals (tabular figures, so a ticking clock never jitters). Calm weights only: 400 to 600.
const textA = localFont({ src: "../fonts/figtree.woff2", weight: "400 600", variable: "--nf-text-a", display: "swap" });
const numA = localFont({ src: "../fonts/nunito.woff2", weight: "300 600", variable: "--nf-num-a", display: "swap" });
// Pairing B (candidate, only loaded for local previews: ?font=b): DM Sans + Quicksand.
const textB = localFont({ src: "../fonts/dm-sans.woff2", weight: "400 600", variable: "--nf-text-b", display: "swap" });
const numB = localFont({ src: "../fonts/quicksand.woff2", weight: "400 600", variable: "--nf-num-b", display: "swap" });

export const metadata: Metadata = { title: "Home", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0f0e13", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

const PREVIEW = process.env.NEXT_PUBLIC_DASH_MOCK === "1";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cls = [textA.variable, numA.variable, ...(PREVIEW ? [textB.variable, numB.variable] : [])].join(" ");
  return (<html lang="en" className={cls}><body>{children}</body></html>);
}
