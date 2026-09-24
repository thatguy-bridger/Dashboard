import { NextRequest, NextResponse } from "next/server";
import { listPresets, createPreset, WIDGET_TYPES, type WidgetType } from "@/lib/presets";

export async function GET() {
  const presets = await listPresets();
  return NextResponse.json({ presets });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const widgets: WidgetType[] = Array.isArray(body.widgets)
    ? body.widgets.filter((w: unknown): w is WidgetType => WIDGET_TYPES.includes(w as WidgetType))
    : [];

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const preset = await createPreset(name, widgets);
  return NextResponse.json({ preset });
}
