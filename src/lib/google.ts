import { d1Query } from "@/lib/d1";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

export function getGoogleAuthUrl(): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

interface TokenRow {
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
}

async function getTokenRow(): Promise<TokenRow | null> {
  const rows = await d1Query<TokenRow>("SELECT * FROM google_tokens WHERE id = 1");
  return rows[0] ?? null;
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${await res.text()}`);
  const data = await res.json();

  const userInfo = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  }).then((r) => r.json());

  const expiresAt = Date.now() + data.expires_in * 1000;

  await d1Query(
    `INSERT INTO google_tokens (id, email, access_token, refresh_token, expires_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       access_token = excluded.access_token,
       refresh_token = COALESCE(excluded.refresh_token, google_tokens.refresh_token),
       expires_at = excluded.expires_at`,
    [userInfo.email ?? null, data.access_token, data.refresh_token ?? null, expiresAt]
  );
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${await res.text()}`);
  const data = await res.json();
  const expiresAt = Date.now() + data.expires_in * 1000;

  await d1Query("UPDATE google_tokens SET access_token = ?, expires_at = ? WHERE id = 1", [
    data.access_token,
    expiresAt,
  ]);

  return { accessToken: data.access_token, expiresAt };
}

export async function getGoogleStatus(): Promise<{ connected: boolean; email: string | null }> {
  const row = await getTokenRow();
  return { connected: Boolean(row?.refresh_token), email: row?.email ?? null };
}

/** Returns a valid access token, refreshing it first if it's expired. Null if never connected. */
export async function getValidAccessToken(): Promise<string | null> {
  const row = await getTokenRow();
  if (!row?.refresh_token) return null;

  if (row.access_token && row.expires_at && row.expires_at > Date.now() + 60_000) {
    return row.access_token;
  }

  const { accessToken } = await refreshAccessToken(row.refresh_token);
  return accessToken;
}

export async function disconnectGoogle(): Promise<void> {
  await d1Query("DELETE FROM google_tokens WHERE id = 1");
}
