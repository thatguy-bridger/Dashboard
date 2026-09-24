import { put, head } from "@vercel/blob";

export type DeviceStatus = "pending" | "approved" | "rejected";

export interface Device {
  id: string;
  name: string | null;
  status: DeviceStatus;
  ip: string | null;
  userAgent: string | null;
  touchCapable: boolean;
  touchOverride: boolean | null;
  firstSeen: number;
  lastSeen: number;
}

const REGISTRY_PATH = "home-base/devices.json";

async function readRegistry(): Promise<Record<string, Device>> {
  try {
    const info = await head(REGISTRY_PATH);
    const res = await fetch(info.url, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, Device>;
  } catch {
    return {};
  }
}

async function writeRegistry(devices: Record<string, Device>): Promise<void> {
  await put(REGISTRY_PATH, JSON.stringify(devices), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
  });
}

export async function listDevices(): Promise<Device[]> {
  const devices = await readRegistry();
  return Object.values(devices).sort((a, b) => b.lastSeen - a.lastSeen);
}

export async function touchDevice(params: {
  id: string;
  ip: string | null;
  userAgent: string | null;
  touchCapable: boolean;
}): Promise<Device> {
  const devices = await readRegistry();
  const now = Date.now();
  const existing = devices[params.id];

  const device: Device = existing
    ? { ...existing, ip: params.ip, userAgent: params.userAgent, touchCapable: params.touchCapable, lastSeen: now }
    : {
        id: params.id,
        name: null,
        status: "pending",
        ip: params.ip,
        userAgent: params.userAgent,
        touchCapable: params.touchCapable,
        touchOverride: null,
        firstSeen: now,
        lastSeen: now,
      };

  devices[params.id] = device;
  await writeRegistry(devices);
  return device;
}

export async function updateDevice(
  id: string,
  patch: Partial<Pick<Device, "name" | "status" | "touchOverride">>
): Promise<Device | null> {
  const devices = await readRegistry();
  const existing = devices[id];
  if (!existing) return null;

  const updated = { ...existing, ...patch };
  devices[id] = updated;
  await writeRegistry(devices);
  return updated;
}
