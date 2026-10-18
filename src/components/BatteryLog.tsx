"use client";

import { useEffect, useState } from "react";

const PIN_KEY = "hb-control-pin";

interface Bucket { label: string; hours: number; change: number; perHour: number | null }
interface Report {
  samples: number;
  since: number | null;
  now: { level: number; charging: boolean; temp: number | null; screen: number | null; extra: Record<string, string> } | null;
  drain: { overall: Bucket[]; screen: Bucket[]; music: Bucket[]; motion: Bucket[]; hour: Bucket[] };
  charging: { overall: Bucket[]; screen: Bucket[]; music: Bucket[]; motion: Bucket[] };
  series: [number, number, number, number][];
}

const fmt = (b: Bucket, unit: string) => (b.perHour == null ? "not enough data yet" : `${b.perHour > 0 ? "+" : ""}${b.perHour}% per ${unit}`);

function Table({ title, rows, note }: { title: string; rows: Bucket[]; note?: string }) {
  const known = rows.filter((r) => r.perHour != null);
  if (!rows.length) return null;
  // the biggest loss first
  const sorted = [...rows].sort((a, b) => (a.perHour ?? 0) - (b.perHour ?? 0));
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-1">{title}</div>
      {sorted.map((r) => (
        <div key={r.label} className="flex justify-between text-sm py-0.5">
          <span>{r.label} <span className="text-[var(--muted)]">({r.hours} h logged)</span></span>
          <span className="font-semibold" style={{ color: r.perHour != null && r.perHour < -3 ? "#ff8a80" : undefined }}>{fmt(r, "hour")}</span>
        </div>
      ))}
      {!known.length && note && <div className="text-xs text-[var(--muted)]">{note}</div>}
    </div>
  );
}

/** A line of the battery level over the last 48 hours; the stretches where the tablet was charging are shaded. */
function Chart({ series }: { series: Report["series"] }) {
  if (series.length < 2) return null;
  const w = 600, h = 120;
  const t0 = series[0][0], t1 = series[series.length - 1][0];
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * w;
  const y = (v: number) => h - (v / 100) * h;
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const bands: React.ReactNode[] = [];
  for (let i = 1; i < series.length; i++) if (series[i][2] && series[i - 1][2]) bands.push(<rect key={i} x={x(series[i - 1][0])} width={Math.max(1, x(series[i][0]) - x(series[i - 1][0]))} y={0} height={h} fill="rgba(120,220,150,0.12)" />);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full mb-4" style={{ height: 120 }} preserveAspectRatio="none">
      {bands}
      <path d={path} fill="none" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** What is draining the wall tablet's battery, from the log the dashboard keeps (see lib/batteryLog.ts). */
export function BatteryLog() {
  const [r, setR] = useState<Report | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let pin = "";
    try { pin = localStorage.getItem(PIN_KEY) ?? ""; } catch { /* private mode */ }
    fetch("/api/home/battery?days=7", { cache: "no-store", headers: { "x-control-pin": pin } })
      .then(async (res) => { if (res.ok) setR(await res.json()); else setMsg("Enter the control PIN in the smart home section first."); })
      .catch(() => setMsg("Couldn't load the battery log."));
  }, []);
  if (!r) return <div className="text-sm text-[var(--muted)]">{msg ?? "Loading…"}</div>;
  if (!r.samples) return <div className="text-sm text-[var(--muted)]">Nothing logged yet. A reading is saved every 3 minutes.</div>;
  const unplugged = r.drain.overall.some((b) => b.perHour != null);
  return (
    <div>
      {r.now && (
        <div className="text-sm mb-3">
          Now <span className="font-semibold">{Math.round(r.now.level)}%</span>{r.now.charging ? " · charging" : " · on battery"}
          {r.now.temp != null ? ` · ${r.now.temp}°C` : ""}{r.now.screen != null ? ` · screen ${r.now.screen ? "on" : "off"}` : ""}
          <span className="text-[var(--muted)]"> · {r.samples} readings since {r.since ? new Date(r.since).toLocaleDateString() : ""}</span>
        </div>
      )}
      <Chart series={r.series} />
      {!unplugged && (
        <div className="text-sm mb-4 text-[var(--muted)]">
          The tablet has been plugged in for the whole log, so there is no drain to measure yet. Unplug it for a day or two (or let it run down) and this fills in.
          Meanwhile, the &quot;plugged in&quot; numbers below show how much a busy tablet gains more slowly.
        </div>
      )}
      {unplugged && (
        <>
          <Table title="Drain overall (on battery)" rows={r.drain.overall} />
          <Table title="By screen" rows={r.drain.screen} />
          <Table title="By music" rows={r.drain.music} />
          <Table title="By someone being in front of it" rows={r.drain.motion} />
          <Table title="By time of day" rows={r.drain.hour} />
        </>
      )}
      <Table title="While plugged in: net gain per hour (lower = the tablet is using more)" rows={[...r.charging.screen, ...r.charging.music, ...r.charging.motion]} />
    </div>
  );
}
