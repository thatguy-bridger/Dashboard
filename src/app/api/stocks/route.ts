import { cacheHeaders } from "@/lib/http";
import { NextResponse } from "next/server";

// A short watchlist — no Control UI for this yet, just a fixed list to
// start with. Comma-separated STOCKS env var overrides it.
const DEFAULT_SYMBOLS = ["AAPL", "GOOGL", "SPY"];

interface Quote {
  symbol: string;
  price: number;
  changePercent: number;
}

// Yahoo Finance's chart endpoint is unofficial (no published terms for this
// exact use) but is the standard free, keyless source most hobby stock
// widgets use — same risk tier as the Find My integration: works today,
// could break if Yahoo changes it, no account risk either way since it's
// read-only and unauthenticated.
async function fetchQuote(symbol: string): Promise<Quote | null> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
    next: { revalidate: 300 },
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") return null;
  return {
    symbol,
    price: Math.round(meta.regularMarketPrice * 100) / 100,
    changePercent: Math.round((meta.regularMarketChangePercent ?? 0) * 100) / 100,
  };
}

export async function GET() {
  const symbols = (process.env.STOCKS?.split(",").map((s) => s.trim()) ?? DEFAULT_SYMBOLS).filter(Boolean);
  const quotes = (await Promise.all(symbols.map(fetchQuote))).filter((q): q is Quote => q !== null);
  return NextResponse.json({ quotes }, cacheHeaders(300));
}
