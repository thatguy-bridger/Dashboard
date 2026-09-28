import { NextRequest, NextResponse } from "next/server";
import { listPresets, createPreset, parseWidgets } from "@/lib/presets";
import { parseBackground, DEFAULT_BACKGROUND } from "@/lib/background";

export async function GET() {
  const presets = await listPresets();
  return NextResponse.json({ presets });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const widgets = parseWidgets(body.widgets);
  const background = body.background ? parseBackground(body.background) : DEFAULT_BACKGROUND;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const preset = await createPreset(name, widgets, background);
  return NextResponse.json({ preset });
}
