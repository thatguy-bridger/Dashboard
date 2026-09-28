import { d1Query } from "@/lib/d1";

export interface Countdown {
  id: string;
  label: string;
  targetDate: number;
  createdAt: number;
}

interface CountdownRow {
  id: string;
  label: string;
  target_date: number;
  created_at: number;
}

function fromRow(row: CountdownRow): Countdown {
  return { id: row.id, label: row.label, targetDate: row.target_date, createdAt: row.created_at };
}

export async function listCountdowns(): Promise<Countdown[]> {
  const rows = await d1Query<CountdownRow>("SELECT * FROM countdowns ORDER BY target_date ASC");
  return rows.map(fromRow);
}

export async function createCountdown(label: string, targetDate: number): Promise<Countdown> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await d1Query(
    "INSERT INTO countdowns (id, label, target_date, created_at) VALUES (?, ?, ?, ?)",
    [id, label, targetDate, now]
  );
  return { id, label, targetDate, createdAt: now };
}

export async function deleteCountdown(id: string): Promise<boolean> {
  await d1Query("DELETE FROM countdowns WHERE id = ?", [id]);
  return true;
}
