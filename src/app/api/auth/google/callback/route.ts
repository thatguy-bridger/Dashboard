import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/control?google=error", req.url));
  }
  try {
    await exchangeCodeForTokens(code);
    return NextResponse.redirect(new URL("/control?google=connected", req.url));
  } catch {
    return NextResponse.redirect(new URL("/control?google=error", req.url));
  }
}
