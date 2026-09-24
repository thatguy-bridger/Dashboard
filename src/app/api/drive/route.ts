import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/google";

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
  iconLink: string;
}

export async function GET() {
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ connected: false, files: [] });
  }

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("pageSize", "8");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("fields", "files(id,name,modifiedTime,webViewLink,iconLink)");
  url.searchParams.set("q", "trashed = false");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ connected: true, files: [] });
  }
  const data = await res.json();

  return NextResponse.json({ connected: true, files: (data.files ?? []) as DriveFile[] });
}
