import { cacheHeaders } from "@/lib/http";
import { NextRequest, NextResponse } from "next/server";
import { listNotifications, createNotification, markAllRead, type NotificationLevel } from "@/lib/notifications";

function isLevel(v: unknown): v is NotificationLevel {
  return v === "info" || v === "action_needed" || v === "important";
}

export async function GET() {
  const notifications = await listNotifications();
  return NextResponse.json({ notifications }, cacheHeaders(20));
}

/**
 * The channel Claude (any session, any project) posts through to flag
 * something the user hasn't seen yet — a question that needs their input, or
 * an important note. Guarded by NOTIFY_TOKEN since it's otherwise a public,
 * unauthenticated write endpoint like the rest of this app's mutating routes.
 */
export async function POST(req: NextRequest) {
  const token = process.env.NOTIFY_TOKEN;
  if (token && req.headers.get("x-notify-token") !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  if (typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const notification = await createNotification({
    message: body.message.trim(),
    level: isLevel(body.level) ? body.level : undefined,
    source: typeof body.source === "string" ? body.source : undefined,
  });
  return NextResponse.json({ notification });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.markAllRead === true) {
    await markAllRead();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unsupported patch" }, { status: 400 });
}
