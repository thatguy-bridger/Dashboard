// Google's Photos Library API no longer lets third-party apps list or
// search a user's whole library — since the 2025 policy change, apps can
// only see items the user explicitly hands over through the Picker API.
// So "recent photos" here really means "photos you picked once", and we
// re-fetch each picked item's URL on every read since the returned baseUrl
// expires after about an hour.
import { d1Query } from "@/lib/d1";
import { getValidAccessToken } from "@/lib/google";

const PICKER_BASE = "https://photospicker.googleapis.com/v1";
const SETTINGS_KEY = "googlePhotosMediaItemIds";

export interface PickerSession {
  id: string;
  pickerUri: string;
  pollIntervalMs: number;
  mediaItemsSet: boolean;
}

async function authHeaders(): Promise<{ Authorization: string } | null> {
  const token = await getValidAccessToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export async function createPickerSession(): Promise<PickerSession | null> {
  const headers = await authHeaders();
  if (!headers) return null;

  const res = await fetch(`${PICKER_BASE}/sessions`, { method: "POST", headers });
  if (!res.ok) throw new Error(`Failed to create picker session: ${res.status} ${await res.text()}`);
  const data = await res.json();

  return {
    id: data.id,
    pickerUri: data.pickerUri,
    pollIntervalMs: (data.pollingConfig?.pollInterval ? parseFloat(data.pollingConfig.pollInterval) : 3) * 1000,
    mediaItemsSet: Boolean(data.mediaItemsSet),
  };
}

export async function getPickerSession(sessionId: string): Promise<PickerSession | null> {
  const headers = await authHeaders();
  if (!headers) return null;

  const res = await fetch(`${PICKER_BASE}/sessions/${sessionId}`, { headers });
  if (!res.ok) throw new Error(`Failed to poll picker session: ${res.status} ${await res.text()}`);
  const data = await res.json();

  return {
    id: data.id,
    pickerUri: data.pickerUri,
    pollIntervalMs: (data.pollingConfig?.pollInterval ? parseFloat(data.pollingConfig.pollInterval) : 3) * 1000,
    mediaItemsSet: Boolean(data.mediaItemsSet),
  };
}

/** Pulls the picked media item IDs out of a completed session and saves
 * them for later — the session itself is deleted since it can't be used to
 * fetch items forever, but the IDs remain independently fetchable. */
export async function finalizePickerSession(sessionId: string): Promise<number> {
  const headers = await authHeaders();
  if (!headers) return 0;

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${PICKER_BASE}/mediaItems`);
    url.searchParams.set("sessionId", sessionId);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();
    ids.push(...((data.mediaItems ?? []) as { id: string }[]).map((m) => m.id));
    pageToken = data.nextPageToken;
  } while (pageToken);

  await d1Query(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [SETTINGS_KEY, JSON.stringify(ids)]
  );

  await fetch(`${PICKER_BASE}/sessions/${sessionId}`, { method: "DELETE", headers }).catch(() => {});

  return ids.length;
}

export async function getSelectedMediaItemIds(): Promise<string[]> {
  const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [
    SETTINGS_KEY,
  ]);
  if (!rows[0]?.value) return [];
  try {
    return JSON.parse(rows[0].value) as string[];
  } catch {
    return [];
  }
}

export interface PhotoItem {
  id: string;
  url: string;
}

/** Re-fetches a fresh, ~1-hour-valid image URL for each previously picked
 * item. Items the user has since deleted or revoked are silently dropped. */
export async function getSelectedPhotos(): Promise<PhotoItem[]> {
  const headers = await authHeaders();
  if (!headers) return [];

  const ids = await getSelectedMediaItemIds();
  const items = await Promise.all(
    ids.map(async (id): Promise<PhotoItem | null> => {
      const res = await fetch(`${PICKER_BASE}/mediaItems/${id}`, { headers });
      if (!res.ok) return null;
      const data = await res.json();
      const baseUrl = data.mediaFile?.baseUrl;
      if (!baseUrl) return null;
      return { id, url: `${baseUrl}=w1200-h800` };
    })
  );

  return items.filter((i): i is PhotoItem => i !== null);
}
