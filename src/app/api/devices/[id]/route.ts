import { NextRequest, NextResponse } from "next/server";
import { updateDevice, getDevice } from "@/lib/registry";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const device = await getDevice(id);
  if (!device) {
    return NextResponse.json({ error: "device not found" }, { status: 404 });
  }
  return NextResponse.json({ device });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const patch: {
    name?: string;
    status?: "pending" | "approved" | "rejected";
    touchOverride?: boolean | null;
    presetId?: string | null;
  } = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (body.status === "pending" || body.status === "approved" || body.status === "rejected") {
    patch.status = body.status;
  }
  if (body.touchOverride === null || typeof body.touchOverride === "boolean") {
    patch.touchOverride = body.touchOverride;
  }
  if (body.presetId === null || typeof body.presetId === "string") {
    patch.presetId = body.presetId;
  }

  const device = await updateDevice(id, patch);
  if (!device) {
    return NextResponse.json({ error: "device not found" }, { status: 404 });
  }
  return NextResponse.json({ device });
}
