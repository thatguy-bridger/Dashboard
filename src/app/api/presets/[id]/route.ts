import { NextRequest, NextResponse } from "next/server";
import { updatePreset, setDefaultPreset, deletePreset, parseWidgets } from "@/lib/presets";
import { parseBackground } from "@/lib/background";
import type { BackgroundConfig } from "@/lib/background";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (body.isDefault === true) {
    const preset = await setDefaultPreset(id);
    if (!preset) {
      return NextResponse.json({ error: "preset not found" }, { status: 404 });
    }
    return NextResponse.json({ preset });
  }

  const patch: { name?: string; widgets?: ReturnType<typeof parseWidgets>; background?: BackgroundConfig } = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (Array.isArray(body.widgets)) patch.widgets = parseWidgets(body.widgets);
  if (body.background && typeof body.background === "object") patch.background = parseBackground(body.background);

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
