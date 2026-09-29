import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/spotify";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/control?spotify=error", req.url));
  }
  try {
    await exchangeCodeForTokens(code);
    return NextResponse.redirect(new URL("/control?spotify=connected", req.url));
  } catch {
    return NextResponse.redirect(new URL("/control?spotify=error", req.url));
  }
}
