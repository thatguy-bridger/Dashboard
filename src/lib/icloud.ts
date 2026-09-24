// Minimal CalDAV client for iCloud. Uses regex-based XML/ICS parsing instead
// of a full parser library — iCloud's CalDAV responses are consistent enough
// in practice for the handful of fields this dashboard needs.

function authHeader(): string {
  const email = process.env.ICLOUD_EMAIL!;
  const password = process.env.ICLOUD_APP_PASSWORD!;
  return "Basic " + Buffer.from(`${email}:${password}`).toString("base64");
}

async function propfind(url: string, depth: "0" | "1", body: string): Promise<{ text: string; baseUrl: string }> {
  const res = await fetch(url, {
    method: "PROPFIND",
    headers: {
      Authorization: authHeader(),
      Depth: depth,
      "Content-Type": "text/xml; charset=utf-8",
      "User-Agent": "HomeBaseDashboard/1.0",
      Accept: "text/xml, application/xml",
    },
    body,
  });
  if (!res.ok && res.status !== 207) {
    const body = await res.text();
    throw new Error(`PROPFIND ${url} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const text = await res.text();
  const baseUrl = new URL(res.url).origin;
  return { text, baseUrl };
}

function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<[^:>]*:?${tag}[^>]*>([\\s\\S]*?)</[^:>]*:?${tag}>`, "gi");
  return [...xml.matchAll(re)].map((m) => m[1].trim());
}

function extractResponses(xml: string): string[] {
  return extractAll(xml, "response");
}

interface CalendarInfo {
  href: string;
  displayName: string;
}

export async function discoverCalendars(): Promise<{ baseUrl: string; calendars: CalendarInfo[] }> {
  const principalBody = `<?xml version="1.0" encoding="utf-8"?>
    <A:propfind xmlns:A="DAV:"><A:prop><A:current-user-principal/></A:prop></A:propfind>`;
  const step1 = await propfind("https://caldav.icloud.com/", "0", principalBody);
  const principalHref = extractAll(step1.text, "href")[0];
  if (!principalHref) throw new Error("no principal href found");

  const homeSetBody = `<?xml version="1.0" encoding="utf-8"?>
    <A:propfind xmlns:A="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <A:prop><C:calendar-home-set/></A:prop></A:propfind>`;
  const step2 = await propfind(step1.baseUrl + principalHref, "0", homeSetBody);
  const homeSetHref = extractAll(step2.text, "href")[0];
  if (!homeSetHref) throw new Error("no calendar-home-set href found");

  const listBody = `<?xml version="1.0" encoding="utf-8"?>
    <A:propfind xmlns:A="DAV:"><A:prop><A:resourcetype/><A:displayname/></A:prop></A:propfind>`;
  const step3 = await propfind(step2.baseUrl + homeSetHref, "1", listBody);

  const calendars: CalendarInfo[] = [];
  for (const entry of extractResponses(step3.text)) {
    const isCalendar = /<[^:>]*:?resourcetype[^>]*>[\s\S]*?<[^:>]*:?calendar\b/i.test(entry);
    if (!isCalendar) continue;
    const href = extractAll(entry, "href")[0];
    const displayName = extractAll(entry, "displayname")[0] || "Calendar";
    if (href) calendars.push({ href, displayName });
  }

  return { baseUrl: step3.baseUrl, calendars };
}

export interface ICloudEvent {
  summary: string;
  start: string;
  calendar: string;
}

function parseICSEvents(ics: string, calendarName: string): ICloudEvent[] {
  const events: ICloudEvent[] = [];
  const blocks = ics.split("BEGIN:VEVENT").slice(1);
  for (const block of blocks) {
    const summaryMatch = block.match(/SUMMARY:(.*)/);
    const dtStartMatch = block.match(/DTSTART[^:]*:(\S+)/);
    if (!dtStartMatch) continue;
    events.push({
      summary: summaryMatch?.[1]?.trim() || "(no title)",
      start: dtStartMatch[1].trim(),
      calendar: calendarName,
    });
  }
  return events;
}

export async function getICloudEvents(): Promise<ICloudEvent[]> {
  if (!process.env.ICLOUD_EMAIL || !process.env.ICLOUD_APP_PASSWORD) return [];

  const { baseUrl, calendars } = await discoverCalendars();

  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const reportBody = `<?xml version="1.0" encoding="utf-8"?>
    <C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <D:prop><D:getetag/><C:calendar-data/></D:prop>
      <C:filter>
        <C:comp-filter name="VCALENDAR">
          <C:comp-filter name="VEVENT">
            <C:time-range start="${fmt(now)}" end="${fmt(end)}"/>
          </C:comp-filter>
        </C:comp-filter>
      </C:filter>
    </C:calendar-query>`;

  const allEvents: ICloudEvent[] = [];

  await Promise.all(
    calendars.map(async (cal) => {
      try {
        const res = await fetch(baseUrl + cal.href, {
          method: "REPORT",
          headers: {
            Authorization: authHeader(),
            Depth: "1",
            "Content-Type": "text/xml; charset=utf-8",
            "User-Agent": "HomeBaseDashboard/1.0",
            Accept: "text/xml, application/xml",
          },
          body: reportBody,
        });
        if (!res.ok) return;
        const text = await res.text();
        for (const entry of extractResponses(text)) {
          const icsBlocks = extractAll(entry, "calendar-data");
          for (const ics of icsBlocks) {
            allEvents.push(...parseICSEvents(ics, cal.displayName));
          }
        }
      } catch {
        // skip calendars that fail to fetch
      }
    })
  );

  allEvents.sort((a, b) => a.start.localeCompare(b.start));
  return allEvents;
}
