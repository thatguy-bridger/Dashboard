import { NextResponse } from "next/server";
import { deleteCountdown } from "@/lib/countdowns";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteCountdown(id);
  return NextResponse.json({ ok: true });
}
