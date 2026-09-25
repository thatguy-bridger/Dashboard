// Reverse geocoding for device location labels, via OpenStreetMap's free
// Nominatim API. Nominatim's usage policy caps requests at ~1/sec and asks
// callers to cache results rather than re-querying the same point — this
// dashboard polls Find My every 60s, so results are cached in D1 (rounded
// to ~100m) instead of hitting Nominatim on every poll for a stationary
// device.
import { d1Query } from "@/lib/d1";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const USER_AGENT = "HomeBaseDashboard/1.0 (personal single-household use)";

export interface LocationLabel {
  city: string | null;
  place: string | null;
}

function cacheKey(lat: number, lon: number): string {
  // ~3 decimal places is roughly 100m — plenty precise for "which city /
  // which building", and coarse enough that GPS jitter reuses the cache.
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

async function getCached(key: string): Promise<LocationLabel | null> {
  const rows = await d1Query<{ city: string | null; place: string | null; updated_at: number }>(
    "SELECT city, place, updated_at FROM geocode_cache WHERE lat_key = ?",
    [key]
  );
  const row = rows[0];
  if (!row || Date.now() - row.updated_at > CACHE_TTL_MS) return null;
  return { city: row.city, place: row.place };
}

async function setCached(key: string, label: LocationLabel): Promise<void> {
  await d1Query(
    `INSERT INTO geocode_cache (lat_key, city, place, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(lat_key) DO UPDATE SET city = excluded.city, place = excluded.place, updated_at = excluded.updated_at`,
    [key, label.city, label.place, Date.now()]
  );
}

interface NominatimResponse {
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    county?: string;
    amenity?: string;
    building?: string;
    office?: string;
    shop?: string;
  };
}

export async function getLocationLabel(lat: number, lon: number): Promise<LocationLabel> {
  const key = cacheKey(lat, lon);
  const cached = await getCached(key);
  if (cached) return cached;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return { city: null, place: null };
    const data: NominatimResponse = await res.json();

    const city =
      data.address?.city ??
      data.address?.town ??
      data.address?.village ??
      data.address?.hamlet ??
      data.address?.municipality ??
      data.address?.county ??
      null;

    // `name` is only populated when the point resolves to a named
    // feature (a business, park, campus, etc.) rather than a bare address.
    const place = data.name ?? data.address?.amenity ?? data.address?.office ?? data.address?.shop ?? null;

    const label: LocationLabel = { city, place };
    await setCached(key, label);
    return label;
  } catch {
    return { city: null, place: null };
  }
}
