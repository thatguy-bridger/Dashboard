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

// Duplicated from icloudjs's (unexported) consts module — needed to call the
// trusted-device resend endpoint directly, since the library only sends this
// once, implicitly, as a side effect of signin/complete.
const AUTH_ENDPOINT = "https://idmsa.apple.com/appleauth/auth/";
const CLIENT_ID = "d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d";
const AUTH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:103.0) Gecko/20100101 Firefox/103.0",
  Accept: "application/json",
  "Content-Type": "application/json",
  Origin: "https://idmsa.apple.com",
  Referer: "https://idmsa.apple.com/",
  "X-Apple-Widget-Key": CLIENT_ID,
  "X-Apple-OAuth-Client-Id": CLIENT_ID,
  "X-Apple-OAuth-Response-Type": "code",
  "X-Apple-OAuth-Response-Mode": "web_message",
  "X-Apple-OAuth-Client-Type": "firstPartyAuth",
};

const SETUP_ENDPOINT = "https://setup.icloud.com/setup/ws/1/accountLogin";
const DEFAULT_HEADERS = {
  "User-Agent": AUTH_HEADERS["User-Agent"],
  Accept: "application/json",
  "Content-Type": "application/json",
  Origin: "https://www.icloud.com",
};

// As of iOS/macOS 26.4, Apple reworked the trusted-device 2FA handshake:
// the resend/verify code request must go through icloud.com's origin (not
// idmsa.apple.com) and a 409 with securityCode.valid:true is now the normal
// *success* response for a correct code, not a failure — icloudjs's built-in
// provideMfaCode() still expects the old plain-204 response and throws on
// this, so the code-submission step is reimplemented here instead of calling
// into the library for it.
function icloudOriginMfaHeaders(pending: StoredSession) {
  return {
    ...AUTH_HEADERS,
    Origin: "https://www.icloud.com",
    Referer: "https://www.icloud.com/",
    "X-Apple-OAuth-State": `auth-${crypto.randomUUID()}`,
    scnt: pending.scnt!,
    "X-Apple-ID-Session-Id": pending.sessionId!,
    Cookie: "aasp=" + pending.aasp,
  };
}

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

  const verifyRes = await fetch(AUTH_ENDPOINT + "verify/trusteddevice/securitycode", {
    method: "POST",
    headers: icloudOriginMfaHeaders(pending),
    body: JSON.stringify({ securityCode: { code } }),
  });

  let verifyBody: { securityCode?: { valid?: boolean } } = {};
  try {
    verifyBody = await verifyRes.json();
  } catch {
    // 204 (the legacy success case) has no body
  }

  const succeeded = verifyRes.status === 204 || (verifyRes.status === 409 && verifyBody.securityCode?.valid === true);
  if (!succeeded) {
    throw new Error(`Incorrect verification code (${verifyRes.status}) ${JSON.stringify(verifyBody)}`);
  }

  // Trust this "browser" so future logins skip 2FA, then exchange the
  // resulting trust token for the actual iCloud web session cookies.
  const trustRes = await fetch(AUTH_ENDPOINT + "2sv/trust", {
    headers: icloudOriginMfaHeaders(pending),
  });
  const sessionToken = trustRes.headers.get("x-apple-session-token") ?? pending.sessionToken;
  const trustToken = trustRes.headers.get("x-apple-twosv-trust-token") ?? undefined;
  if (!sessionToken) {
    throw new Error("2sv/trust did not return a session token");
  }

  const setupRes = await fetch(SETUP_ENDPOINT, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ dsWebAuthToken: sessionToken, trustToken }),
  });
  if (!setupRes.ok) {
    throw new Error(`accountLogin failed: ${setupRes.status} ${await setupRes.text()}`);
  }
  const accountInfo = await setupRes.json();
  // headers.entries()/.get() merge multiple Set-Cookie values into one
  // comma-joined string, and naively splitting on ", " corrupts any cookie
  // whose Expires attribute itself contains a comma (e.g. "Wed, 21 Oct
  // ..."). getSetCookie() returns them as a proper, unmangled string[].
  const icloudCookies = setupRes.headers
    .getSetCookie()
    .map((v) => Cookie.parse(v))
    .filter((c): c is Cookie => !!c);

  await saveSession(email, {
    status: "ready",
    username: email,
    sessionToken,
    trustToken,
    icloudCookies: icloudCookies.map((c) => c.toJSON()),
    accountInfo,
  });
}

/** Re-requests the 2FA push to trusted devices for a login that's already
 * awaiting a code (doesn't restart the password step). */
export async function resendFindMyCode(email: string): Promise<{ code?: string }> {
  const pending = await loadSession(email);
  if (!pending || pending.status !== "mfa_requested") {
    throw new Error("No pending iCloud login found. Start the login flow again.");
  }

  // Since iOS/macOS 26.4, POST /verify/trusteddevice returns 405 — the
  // resend must go through PUT on the securitycode endpoint instead, with
  // an empty body, using the icloud.com origin.
  const res = await fetch(AUTH_ENDPOINT + "verify/trusteddevice/securitycode", {
    method: "PUT",
    headers: icloudOriginMfaHeaders(pending),
  });

  // A 409 with securityCode.valid:true is the normal "code sent" response
  // now, not just an alternate success shape for signin/complete.
  if (res.status !== 200 && res.status !== 202 && res.status !== 409) {
    throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  }

  let body: { securityCode?: { valid?: boolean; code?: string } } = {};
  try {
    body = await res.json();
  } catch {
    // 200/202 with an empty body is fine — there's just nothing to inspect
  }
  if (body.securityCode?.valid === false) {
    throw new Error("Apple did not send a new code (securityCode.valid: false)");
  }

  // Apple rotates scnt (and sometimes the session id / aasp cookie) on this
  // response — verifying against the old ones is what was causing a 409 on
  // an otherwise-correct code, so persist whatever changed before returning.
  const newScnt = res.headers.get("scnt");
  const newSessionId = res.headers.get("X-Apple-ID-Session-Id");
  const aaspHeader = res.headers.getSetCookie().find((v) => v.includes("aasp="));
  const newAasp = aaspHeader?.split("aasp=")[1]?.split(";")[0];

  console.log("[icloudSession] resendFindMyCode header diff", {
    scntChanged: newScnt !== null && newScnt !== pending.scnt,
    sessionIdChanged: newSessionId !== null && newSessionId !== pending.sessionId,
    aaspChanged: newAasp !== undefined && newAasp !== pending.aasp,
    gotScntHeader: newScnt !== null,
    gotSessionIdHeader: newSessionId !== null,
    gotAaspHeader: newAasp !== undefined,
  });

  await saveSession(email, {
    ...pending,
    scnt: newScnt ?? pending.scnt,
    sessionId: newSessionId ?? pending.sessionId,
    aasp: newAasp ?? pending.aasp,
  });

  return { code: body.securityCode?.code };
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

interface RawFindMyDevice {
  id: string;
  name: string;
  deviceClass: string;
  batteryLevel?: number;
  fmlyShare?: boolean;
  location?: {
    latitude: number;
    longitude: number;
    isOld: boolean;
    timeStamp: number;
  };
}

export async function getFindMyLocations(email: string): Promise<LocatedDevice[]> {
  const session = await loadSession(email);
  if (!session || session.status !== "ready") {
    throw new NeedsLoginError();
  }

  const service = newService(email);
  restoreReadySession(service, session);

  const accountInfo = session.accountInfo as { webservices?: { findme?: { url?: string } } } | undefined;
  const serviceUri = accountInfo?.webservices?.findme?.url;
  if (!serviceUri) {
    throw new Error("No Find My service URL on this session — reconnect iCloud in Control.");
  }

  // Calling icloudjs's own iCloudFindMyService here would also fire an
  // unawaited, uncaught refresh() from its constructor — when Apple's
  // endpoint returns an empty body (which it does intermittently), that
  // unhandled rejection crashes the whole serverless invocation. Hitting
  // the endpoint directly avoids that entirely.
  const res = await fetch(`${serviceUri}/fmipservice/client/web/refreshClient`, {
    method: "POST",
    headers: service.authStore.getHeaders(),
    body: JSON.stringify({
      clientContext: {
        fmly: false, // this dashboard only wants the account's own devices
        shouldLocate: true,
        deviceListVersion: 1,
        selectedDevice: "all",
      },
    }),
  });

  const text = await res.text();
  if (!text) {
    throw new Error(
      `Find My refresh returned an empty response (status ${res.status}) — the session may need reconnecting.`
    );
  }
  const data = JSON.parse(text) as { content?: RawFindMyDevice[] };

  // Cookies can rotate on a refresh; keep the stored session current.
  await saveSession(email, captureReadySession(service));

  return (data.content ?? [])
    .filter((d) => !d.fmlyShare)
    .map((d) => ({
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
