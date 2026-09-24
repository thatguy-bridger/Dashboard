const API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * Runs a single parameterized SQL statement against the Cloudflare D1
 * database and returns its result rows. Each call is an atomic operation on
 * D1's side, unlike the old JSON-blob-in-Vercel-Blob approach, so concurrent
 * writes (a device heartbeat and a controller action, say) can't silently
 * clobber each other.
 */
export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  const res = await fetch(
    `${API_BASE}/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 query failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(data.errors)}`);
  }

  return (data.result?.[0]?.results ?? []) as T[];
}
