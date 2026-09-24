import { NextResponse } from "next/server";

export async function GET() {
  const email = process.env.ICLOUD_EMAIL!;
  const password = process.env.ICLOUD_APP_PASSWORD!;
  const auth = "Basic " + Buffer.from(`${email}:${password}`).toString("base64");

  const res = await fetch("https://caldav.icloud.com/", {
    method: "GET",
    redirect: "manual",
    headers: {
      Authorization: auth,
      "User-Agent": "HomeBaseDashboard/1.0",
    },
  });
  const body = await res.text();

  return NextResponse.json({
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    bodyPreview: body.slice(0, 500),
    emailUsed: email,
    passwordLength: password?.length,
  });
}
