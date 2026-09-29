import { NextResponse } from "next/server";

// NPR's public top-stories RSS feed — no API key required.
const FEED_URL = "https://feeds.npr.org/1001/rss.xml";

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

export async function GET() {
  const res = await fetch(FEED_URL, { next: { revalidate: 900 } });
  if (!res.ok) {
    return NextResponse.json({ error: "news fetch failed" }, { status: 502 });
  }
  const xml = await res.text();

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => {
      const block = m[1];
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
      if (!titleMatch) return null;
      const title = decodeEntities(titleMatch[1].replace("<![CDATA[", "").replace("]]>", "").trim());
      if (!title) return null;

      // NPR's content:encoded embeds the story's lead image as a plain
      // <img> tag — no separate media:content/enclosure field to rely on.
      const imgMatch = block.match(/<img src=['"]([^'"]+)['"]/);
      return { title, imageUrl: imgMatch?.[1] ?? null };
    })
    .filter((item): item is { title: string; imageUrl: string | null } => item !== null)
    .slice(0, 6);

  return NextResponse.json({ items });
}
