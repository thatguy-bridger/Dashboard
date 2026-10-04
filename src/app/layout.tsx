import type { Metadata } from "next";
import { Inter, Nunito, Lexend } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// Rounded numerals for the clock, temps, times (SF Pro Rounded stand-in off Apple devices).
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["600", "700", "800"] });
// Wide face for the tracked-out caps labels (SF "expanded" stand-in).
const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "Home Base",
  description: "Home Base dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${nunito.variable} ${lexend.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
