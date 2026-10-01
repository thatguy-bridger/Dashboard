"use client";

import {
  BACKGROUND_MODES,
  CURATED_BACKGROUNDS,
  PALETTE_NAMES,
  PALETTES,
  SPEEDS,
  DIRECTIONS,
  randomBackground,
  type BackgroundConfig,
  type BackgroundMode,
} from "@/lib/background";

const MODE_LABELS: Record<BackgroundMode, string> = {
  solid: "Solid",
  gradient: "Gradient",
  colorBlur: "Floating color blur",
  weatherBlur: "Weather-reactive blur",
  musicBlur: "Now-playing blur",
  image: "Image",
  rotate: "Rotating showcase",
};

function Swatch({ palette }: { palette: readonly string[] }) {
  return (
    <div className="w-8 h-8 rounded-md overflow-hidden border border-white/10 shrink-0">
      <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${palette.join(",")})` }} />
    </div>
  );
}

export function BackgroundPicker({
  value,
  onChange,
}: {
  value: BackgroundConfig;
  onChange: (config: BackgroundConfig) => void;
}) {
  function set<K extends keyof BackgroundConfig>(key: K, val: BackgroundConfig[K]) {
    onChange({ ...value, [key]: val });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-[var(--muted)] mb-1.5">Quick picks</div>
        <div className="flex flex-wrap gap-2">
          {CURATED_BACKGROUNDS.map((c) => (
            <button
              key={c.label}
              onClick={() => onChange(c.config)}
              className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border border-[var(--surface-border)] hover:border-[var(--accent)]"
            >
              <Swatch palette={PALETTES[c.config.palette]} />
              {c.label}
            </button>
          ))}
          <button
            onClick={() => onChange(randomBackground())}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30"
          >
            Shuffle 🎲
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Mode
          <select
            value={value.mode}
            onChange={(e) => set("mode", e.target.value as BackgroundMode)}
            className="bg-transparent border border-[var(--surface-border)] rounded-lg px-2 py-1.5"
          >
            {BACKGROUND_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Palette
          <select
            value={value.palette}
            onChange={(e) => set("palette", e.target.value as BackgroundConfig["palette"])}
            className="bg-transparent border border-[var(--surface-border)] rounded-lg px-2 py-1.5"
          >
            {PALETTE_NAMES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Motion speed
          <select
            value={value.speed}
            onChange={(e) => set("speed", e.target.value as BackgroundConfig["speed"])}
            className="bg-transparent border border-[var(--surface-border)] rounded-lg px-2 py-1.5"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Direction
          <select
            value={value.direction}
            onChange={(e) => set("direction", e.target.value as BackgroundConfig["direction"])}
            className="bg-transparent border border-[var(--surface-border)] rounded-lg px-2 py-1.5"
          >
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Blob count ({value.blobCount})
          <input
            type="range"
            min={2}
            max={8}
            value={value.blobCount}
            onChange={(e) => set("blobCount", Number(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Dim overlay ({Math.round(value.dim * 100)}%)
          <input
            type="range"
            min={0}
            max={85}
            value={Math.round(value.dim * 100)}
            onChange={(e) => set("dim", Number(e.target.value) / 100)}
          />
        </label>
      </div>

      {value.mode === "image" && (
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Image URL
          <input
            value={value.imageUrl ?? ""}
            onChange={(e) => set("imageUrl", e.target.value)}
            placeholder="https://…"
            className="bg-transparent border border-[var(--surface-border)] rounded-lg px-2 py-1.5"
          />
        </label>
      )}

      {value.mode === "weatherBlur" && (
        <p className="text-xs text-[var(--muted)]">
          Palette shifts automatically with live conditions (clear, cloudy, rain, snow, storm, night).
        </p>
      )}
      {value.mode === "musicBlur" && (
        <p className="text-xs text-[var(--muted)]">
          Placeholder pulse for now — will react to a now-playing source once one is connected.
        </p>
      )}
      {value.mode === "rotate" && (
        <p className="text-xs text-[var(--muted)]">
          Pick &quot;Rotating showcase&quot; above for a starter cycle, or shuffle for a fresh single look.
        </p>
      )}
    </div>
  );
}
