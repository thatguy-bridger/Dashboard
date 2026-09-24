import { NextRequest, NextResponse } from "next/server";
import { updatePreset, deletePreset, parseWidgets } from "@/lib/presets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const patch: { name?: string; widgets?: ReturnType<typeof parseWidgets> } = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (Array.isArray(body.widgets)) patch.widgets = parseWidgets(body.widgets);

  const preset = await updatePreset(id, patch);
  if (!preset) {
    return NextResponse.json({ error: "preset not found" }, { status: 404 });
  }
  return NextResponse.json({ preset });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = await deletePreset(id);
  if (!ok) {
    return NextResponse.json({ error: "preset not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
