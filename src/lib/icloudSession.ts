// Find My location support, layered on top of the `icloudjs` package.
//
// Unlike the CalDAV client in icloud.ts, Find My has no app-password-scoped
// API — it only exists behind Apple's private web session (the same one
// icloud.com/find uses), which requires a full SRP login plus a 2FA code.
// That session can't be recreated from an app password, so it's a separate
// login flow with its own state machine, persisted in D1 so it survives
// across serverless invocations (no local disk to rely on between requests).
import iCloudService from "icloudjs";
import { Cookie } from "tough-cookie";
import { d1Query } from "@/lib/d1";

const DATA_DIR = "/tmp/icloud-findmy";

interface StoredSession {
  status: "mfa_requested" | "ready";
  username: string;
  sessionId?: string;
  sessionToken?: string;
  scnt?: string;
  aasp?: string;
  trustToken?: string;
  icloudCookies?: unknown[];
  accountInfo?: unknown;
}

async function loadSession(email: string): Promise<StoredSession | null> {
  const rows = await d1Query<{ data: string }>(
    "SELECT data FROM icloud_sessions WHERE email = ?",
    [email]
  );
  if (!rows[0]) return null;
  return JSON.parse(rows[0].data) as StoredSession;
}

async function saveSession(email: string, session: StoredSession): Promise<void> {
  await d1Query(
    `INSERT INTO icloud_sessions (email, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    [email, JSON.stringify(session), Date.now()]
  );
}

function newService(username: string): iCloudService {
  return new iCloudService({
    username,
    authMethod: "srp",
    saveCredentials: false,
    trustDevice: true,
    dataDirectory: DATA_DIR,
    logger: "Error",
  });
}

function captureAuthSecrets(service: iCloudService): StoredSession {
  const store = service.authStore;
  return {
    status: "mfa_requested",
    username: service.options.username!,
    sessionId: store.sessionId,
    sessionToken: store.sessionToken,
    scnt: store.scnt,
    aasp: store.aasp,
  };
}

function captureReadySession(service: iCloudService): StoredSession {
  const store = service.authStore;
  return {
    status: "ready",
    username: service.options.username!,
    sessionToken: store.sessionToken,
    trustToken: store.trustToken,
    icloudCookies: store.icloudCookies.map((c) => c.toJSON()),
    accountInfo: service.accountInfo,
  };
}

function restoreAuthSecrets(service: iCloudService, session: StoredSession): void {
  const store = service.authStore;
  store.sessionId = session.sessionId;
  store.sessionToken = session.sessionToken;
  store.scnt = session.scnt;
  store.aasp = session.aasp;
}

function restoreReadySession(service: iCloudService, session: StoredSession): void {
  const store = service.authStore;
  store.sessionToken = session.sessionToken;
  store.trustToken = session.trustToken;
  store.icloudCookies = (session.icloudCookies ?? [])
    .map((c) => Cookie.fromJSON(c as never))
    .filter((c): c is Cookie => !!c);
  service.accountInfo = session.accountInfo as iCloudService["accountInfo"];
}

export class NeedsLoginError extends Error {
  constructor() {
    super("iCloud Find My session is not connected. Start the login flow first.");
  }
}

/** Starts (or resumes) login. Returns whether a 2FA code is now required. */
export async function startFindMyLogin(email: string, password: string): Promise<{ needsCode: boolean }> {
  const service = newService(email);
  await service.authenticate(email, password);

  if ((service.status as string) === "MfaRequested") {
    await saveSession(email, captureAuthSecrets(service));
    return { needsCode: true };
  }

  // No 2FA needed (already-trusted device): authenticate() kicks off the
  // rest of the handshake without awaiting it internally, so wait for the
  // service's own "Ready" signal before persisting anything.
  await service.awaitReady;
  await saveSession(email, captureReadySession(service));
  return { needsCode: false };
}

/** Submits the 6-digit code sent to a trusted device, completing login. */
export async function submitFindMyCode(email: string, code: string): Promise<void> {
  const pending = await loadSession(email);
  if (!pending || pending.status !== "mfa_requested") {
    throw new Error("No pending iCloud login found. Start the login flow again.");
  }

  const service = newService(email);
  restoreAuthSecrets(service, pending);
  await service.provideMfaCode(code);
  await service.awaitReady;

  await saveSession(email, captureReadySession(service));
}

export interface LocatedDevice {
  id: string;
  name: string;
  deviceClass: string;
  batteryLevel: number | null;
  latitude: number | null;
  longitude: number | null;
  isOld: boolean;
  timestamp: number | null;
}

export async function getFindMyLocations(email: string): Promise<LocatedDevice[]> {
  const session = await loadSession(email);
  if (!session || session.status !== "ready") {
    throw new NeedsLoginError();
  }

  const service = newService(email);
  restoreReadySession(service, session);

  const findMy = service.getService("findme");
  const response = await findMy.refresh();

  // Cookies can rotate on a refresh; keep the stored session current.
  await saveSession(email, captureReadySession(service));

  return response.content.map((d) => ({
    id: d.id,
    name: d.name,
    deviceClass: d.deviceClass,
    batteryLevel: typeof d.batteryLevel === "number" ? d.batteryLevel : null,
    latitude: d.location?.latitude ?? null,
    longitude: d.location?.longitude ?? null,
    isOld: d.location?.isOld ?? false,
    timestamp: d.location?.timeStamp ?? null,
  }));
}

export async function getFindMyStatus(email: string): Promise<"disconnected" | "pending_code" | "connected"> {
  const session = await loadSession(email);
  if (!session) return "disconnected";
  return session.status === "ready" ? "connected" : "pending_code";
}
