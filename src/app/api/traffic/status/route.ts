import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ connected: Boolean(process.env.TOMTOM_API_KEY) });
}
