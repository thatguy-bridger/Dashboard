"use client";

import { VISIBILITY_WEATHER_CONDITIONS, type WidgetVisibility, type VisibilityWeatherCondition } from "@/lib/presets";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** One-click starting points; each only touches the fields it names. */
const PRESETS: { label: string; rule: Partial<WidgetVisibility> }[] = [
  { label: "Morning", rule: { timeStart: "05:30", timeEnd: "10:00" } },
  { label: "Daytime", rule: { timeStart: "10:00", timeEnd: "17:00" } },
  { label: "Evening", rule: { timeStart: "17:00", timeEnd: "22:00" } },
  { label: "Night", rule: { timeStart: "22:00", timeEnd: "05:30" } },
  { label: "Weekdays", rule: { days: [1, 2, 3, 4, 5] } },
  { label: "Weekends", rule: { days: [0, 6] } },
  { label: "Raining", rule: { weather: "rain" } },
  { label: "Clear sky", rule: { weather: "clear" } },
  { label: "Snowing", rule: { weather: "snow" } },
];

/** Inline editor for one rule set (a widget's visibility, or a scene's
 *  schedule). Every field is optional and they AND together; clearing all of
 *  them removes the rule rather than leaving an empty object behind. */
export function RulesEditor({
  visibility,
  onChange,
}: {
  visibility: WidgetVisibility | undefined;
  onChange: (visibility: WidgetVisibility | undefined) => void;
}) {
  function patch(partial: Partial<WidgetVisibility>) {
    const next: WidgetVisibility = { ...visibility, ...partial };
    if (!next.timeStart) delete next.timeStart;
    if (!next.timeEnd) delete next.timeEnd;
    if (!next.days?.length || next.days.length === 7) delete next.days;
    if (!next.weather) delete next.weather;
    if (!next.calendarKeyword) delete next.calendarKeyword;
    onChange(Object.keys(next).length > 0 ? next : undefined);
  }

  const days = visibility?.days ?? [];
  function toggleDay(d: number) {
    patch({ days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() });
  }

  return (
    <div className="flex flex-col gap-2 bg-black/20 rounded-lg p-3 mt-1 text-xs">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => patch(p.rule)}
            className="px-2 py-0.5 rounded-full border border-[var(--surface-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            {p.label}
          </button>
        ))}
        <button type="button" onClick={() => onChange(undefined)} className="px-2 py-0.5 rounded-full border border-red-400/30 text-red-300">
          Clear
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[var(--muted)] w-20 shrink-0">Time window</span>
        <input
          type="time"
          value={visibility?.timeStart ?? ""}
          onChange={(e) => patch({ timeStart: e.target.value || undefined })}
          className="bg-transparent border border-[var(--surface-border)] rounded px-2 py-1"
        />
        <span className="text-[var(--muted)]">to</span>
        <input
          type="time"
          value={visibility?.timeEnd ?? ""}
          onChange={(e) => patch({ timeEnd: e.target.value || undefined })}
          className="bg-transparent border border-[var(--surface-border)] rounded px-2 py-1"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[var(--muted)] w-20 shrink-0">Days</span>
        <div className="flex gap-1">
          {DAYS.map((label, d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`w-6 h-6 rounded-full border text-[10px] ${
                days.includes(d)
                  ? "bg-[var(--accent)]/25 border-[var(--accent)] text-[var(--accent)]"
                  : "border-[var(--surface-border)] text-[var(--muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[var(--muted)]">{days.length ? "" : "every day"}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[var(--muted)] w-20 shrink-0">Weather</span>
        <select
          value={visibility?.weather ?? ""}
          onChange={(e) => patch({ weather: (e.target.value || undefined) as VisibilityWeatherCondition | undefined })}
          className="bg-transparent border border-[var(--surface-border)] rounded px-2 py-1 capitalize"
        >
          <option value="">Any</option>
          {VISIBILITY_WEATHER_CONDITIONS.map((c) => (
            <option key={c} value={c} className="bg-[var(--bg)] capitalize">
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[var(--muted)] w-20 shrink-0">Calendar has</span>
        <input
          value={visibility?.calendarKeyword ?? ""}
          onChange={(e) => patch({ calendarKeyword: e.target.value || undefined })}
          placeholder="keyword, e.g. ski"
          className="bg-transparent border border-[var(--surface-border)] rounded px-2 py-1 flex-1"
        />
      </div>
      <p className="text-[var(--muted)]">All set rules must match — leave any blank to not constrain on it.</p>
    </div>
  );
}
