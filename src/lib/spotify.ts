import { d1Query } from "@/lib/d1";

const SCOPES = ["user-read-currently-playing", "user-read-playback-state", "user-modify-playback-state"].join(" ");

export function getSpotifyAuthUrl(): string {
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", process.env.SPOTIFY_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.SPOTIFY_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  return url.toString();
}

interface TokenRow {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
}

async function getTokenRow(): Promise<TokenRow | null> {
  const rows = await d1Query<TokenRow>("SELECT * FROM spotify_tokens WHERE id = 1");
  return rows[0] ?? null;
}

function basicAuthHeader(): string {
  const id = process.env.SPOTIFY_CLIENT_ID!;
  const secret = process.env.SPOTIFY_CLIENT_SECRET!;
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${await res.text()}`);
  const data = await res.json();
  const expiresAt = Date.now() + data.expires_in * 1000;

  await d1Query(
    `INSERT INTO spotify_tokens (id, access_token, refresh_token, expires_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = COALESCE(excluded.refresh_token, spotify_tokens.refresh_token),
       expires_at = excluded.expires_at`,
    [data.access_token, data.refresh_token ?? null, expiresAt]
  );
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${await res.text()}`);
  const data = await res.json();
  const expiresAt = Date.now() + data.expires_in * 1000;

  await d1Query(
    "UPDATE spotify_tokens SET access_token = ?, expires_at = ?, refresh_token = COALESCE(?, refresh_token) WHERE id = 1",
    [data.access_token, expiresAt, data.refresh_token ?? null]
  );

  return data.access_token;
}

export async function getSpotifyStatus(): Promise<{ connected: boolean }> {
  const row = await getTokenRow();
  return { connected: Boolean(row?.refresh_token) };
}

/** Returns a valid access token, refreshing it first if it's expired. Null if never connected. */
export async function getValidSpotifyToken(): Promise<string | null> {
  const row = await getTokenRow();
  if (!row?.refresh_token) return null;

  if (row.access_token && row.expires_at && row.expires_at > Date.now() + 60_000) {
    return row.access_token;
  }

  return refreshAccessToken(row.refresh_token);
}

export async function disconnectSpotify(): Promise<void> {
  await d1Query("DELETE FROM spotify_tokens WHERE id = 1");
}
