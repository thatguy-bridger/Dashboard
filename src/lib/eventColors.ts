// Google Calendar's fixed event-color palette (colorId 1-11). This is a
// long-stable set of values from the Calendar API's /colors endpoint — safe
// to hardcode rather than fetch it every poll for something that never changes.
const GOOGLE_EVENT_COLORS: Record<string, string> = {
  "1": "#7986cb",
  "2": "#33b679",
  "3": "#8e24aa",
  "4": "#e67c73",
  "5": "#f6c026",
  "6": "#f5511d",
  "7": "#039be5",
  "8": "#616161",
  "9": "#3f51b5",
  "10": "#0b8043",
  "11": "#d60000",
};

// A small fixed palette to hash non-Google sources (iCloud calendar names)
// into a consistent color, since CalDAV calendar colors aren't fetched here.
const FALLBACK_PALETTE = ["#7dd3fc", "#f472b6", "#4ade80", "#f59e0b", "#a78bfa", "#fb7185"];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function eventColor(colorId: string | null, source: string): string {
  if (colorId && GOOGLE_EVENT_COLORS[colorId]) return GOOGLE_EVENT_COLORS[colorId];
  return FALLBACK_PALETTE[hashString(source) % FALLBACK_PALETTE.length];
}
