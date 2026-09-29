import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/google";

interface GmailMessage {
  from: string;
  subject: string;
  snippet: string;
}

function headerValue(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function GET() {
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ connected: false, unreadCount: 0, messages: [] });
  }

  const auth = { Authorization: `Bearer ${token}` };

  const [profileRes, listRes] = await Promise.all([
    fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX", { headers: auth, cache: "no-store" }),
    fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&labelIds=INBOX&q=in:inbox",
      { headers: auth, cache: "no-store" }
    ),
  ]);

  const unreadCount = profileRes.ok ? ((await profileRes.json()).messagesUnread ?? 0) : 0;
  if (!listRes.ok) {
    return NextResponse.json({ connected: true, unreadCount, messages: [] });
  }
  const listData = await listRes.json();
  const ids: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id);

  const messages = await Promise.all(
    ids.map(async (id): Promise<GmailMessage | null> => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: auth, cache: "no-store" }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const headers = data.payload?.headers ?? [];
      const from = headerValue(headers, "From").replace(/<.*>/, "").trim();
      return {
        from: from || headerValue(headers, "From"),
        subject: headerValue(headers, "Subject") || "(no subject)",
        snippet: data.snippet ?? "",
      };
    })
  );

  return NextResponse.json({
    connected: true,
    unreadCount,
    messages: messages.filter((m): m is GmailMessage => m !== null),
  });
}
