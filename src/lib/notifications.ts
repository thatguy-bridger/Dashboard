import { d1Query } from "@/lib/d1";

export type NotificationLevel = "info" | "action_needed" | "important";

export interface Notification {
  id: string;
  message: string;
  level: NotificationLevel;
  source: string | null;
  createdAt: number;
  read: boolean;
}

interface NotificationRow {
  id: string;
  message: string;
  level: string;
  source: string | null;
  created_at: number;
  read: number;
}

function isLevel(v: unknown): v is NotificationLevel {
  return v === "info" || v === "action_needed" || v === "important";
}

function fromRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    message: row.message,
    level: isLevel(row.level) ? row.level : "info",
    source: row.source,
    createdAt: row.created_at,
    read: Boolean(row.read),
  };
}

export async function listNotifications(): Promise<Notification[]> {
  const rows = await d1Query<NotificationRow>(
    "SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50"
  );
  return rows.map(fromRow);
}

export async function createNotification(params: {
  message: string;
  level?: NotificationLevel;
  source?: string;
}): Promise<Notification> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const level = params.level ?? "info";
  await d1Query(
    "INSERT INTO notifications (id, message, level, source, created_at, read) VALUES (?, ?, ?, ?, ?, 0)",
    [id, params.message, level, params.source ?? null, now]
  );
  return { id, message: params.message, level, source: params.source ?? null, createdAt: now, read: false };
}

export async function markRead(id: string): Promise<void> {
  await d1Query("UPDATE notifications SET read = 1 WHERE id = ?", [id]);
}

export async function markAllRead(): Promise<void> {
  await d1Query("UPDATE notifications SET read = 1 WHERE read = 0");
}

export async function deleteNotification(id: string): Promise<void> {
  await d1Query("DELETE FROM notifications WHERE id = ?", [id]);
}
