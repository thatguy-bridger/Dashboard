import { NextRequest, NextResponse } from "next/server";
import { getValidSpotifyToken } from "@/lib/spotify";
import { checkPin } from "@/lib/smarthome";

/** The next couple of songs in the queue (for the front screen's "Up next"). */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  const token = await getValidSpotifyToken();
  if (!token) return NextResponse.json({ next: [] });
  const res = await fetch("https://api.spotify.com/v1/me/player/queue", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return NextResponse.json({ next: [] }, { headers: { "Cache-Control": "no-store" } });
  const j = await res.json();
  const next = ((j.queue ?? []) as { id: string; name: string; artists?: { name: string }[]; album?: { images?: { url: string }[] } }[])
    .slice(0, 2)
    .map((t) => ({ id: t.id, name: t.name, artists: (t.artists ?? []).map((a) => a.name).join(", "), art: t.album?.images?.[0]?.url ?? null }));
  return NextResponse.json({ next }, { headers: { "Cache-Control": "no-store" } });
}
