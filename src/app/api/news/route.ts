import { NextResponse } from "next/server";

// NPR's public top-stories RSS feed — no API key required.
const FEED_URL = "https://feeds.npr.org/1001/rss.xml";

export async function GET() {
  const res = await fetch(FEED_URL, { next: { revalidate: 900 } });
  if (!res.ok) {
    return NextResponse.json({ error: "news fetch failed" }, { status: 502 });
  }
  const xml = await res.text();

  const titles = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g)]
    .map((m) => m[1].replace("<![CDATA[", "").replace("]]>", "").trim())
    .filter(Boolean)
    .slice(0, 6);

  return NextResponse.json({ headlines: titles });
}
