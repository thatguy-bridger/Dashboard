"use client";

/** Small line icon for an iCloud device class (iPhone, iPad, Watch, Mac, AirPods). */
export function DeviceGlyph({ cls, color }: { cls: string; color: string }) {
  const k = cls.toLowerCase();
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (k.includes("watch")) return <svg {...p}><rect x="7" y="6" width="10" height="12" rx="3" /><path d="M9 6l.7-3h4.6L15 6M9 18l.7 3h4.6l.7-3" /></svg>;
  if (k.includes("pad") || k.includes("tablet")) return <svg {...p}><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M11 18h2" /></svg>;
  if (k.includes("mac") || k.includes("book") || k.includes("laptop")) return <svg {...p}><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2.5 19h19" /></svg>;
  if (k.includes("pod") || k.includes("head") || k.includes("buds")) return <svg {...p}><path d="M8 4a3.5 3.5 0 0 0-3.5 3.5c0 2 1.5 3 3.5 3v8a1.5 1.5 0 0 0 3 0V7.5A3.5 3.5 0 0 0 8 4zM16 4a3.5 3.5 0 0 1 3.5 3.5c0 2-1.5 3-3.5 3v8a1.5 1.5 0 0 1-3 0" /></svg>;
  if (k.includes("phone")) return <svg {...p}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>;
  return <svg {...p}><rect x="6" y="4" width="12" height="16" rx="2.5" /></svg>;
}
