/**
 * Screen background engine. A background is a small config object rather than
 * a fixed enum of images, so the combination space (mode × palette × speed ×
 * blob count × direction × condition source) runs into the hundreds without
 * needing hundreds of hardcoded assets.
 */

export const BACKGROUND_MODES = [
  "solid",
  "gradient",
  "colorBlur",
  "weatherBlur",
  "musicBlur",
  "image",
  "rotate",
] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

export const PALETTES = {
  midnight: ["#0b0d12", "#1c2333", "#2a1e4d"],
  aurora: ["#0f2027", "#2c5364", "#00c9a7"],
  sunset: ["#3a1c71", "#d76d77", "#ffaf7b"],
  ocean: ["#03050f", "#0a3d62", "#38bdf8"],
  ember: ["#1a0b0b", "#7f1d1d", "#f59e0b"],
  forest: ["#08130d", "#134e2c", "#34d399"],
  blossom: ["#1a0b1a", "#6d2c72", "#f472b6"],
  slate: ["#0b0d12", "#1e293b", "#475569"],
  citrus: ["#141002", "#7c5c00", "#fde047"],
  arctic: ["#05070a", "#1e3a4c", "#a5f3fc"],
} as const;
export type PaletteName = keyof typeof PALETTES;
export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];

export const SPEEDS = ["still", "slow", "medium", "fast"] as const;
export type Speed = (typeof SPEEDS)[number];

export const DIRECTIONS = ["diagonal", "horizontal", "vertical", "radial"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export interface BackgroundConfig {
  mode: BackgroundMode;
  palette: PaletteName;
  speed: Speed;
  direction: Direction;
  blobCount: number; // 2-8, used by colorBlur / weatherBlur / musicBlur
  dim: number; // 0-0.85, darkening overlay so widgets stay legible
  imageUrl?: string;
  /** rotate mode cycles through these configs on `intervalSec`. */
  rotation?: { configs: BackgroundConfig[]; intervalSec: number };
}

export const DEFAULT_BACKGROUND: BackgroundConfig = {
  mode: "colorBlur",
  palette: "midnight",
  speed: "slow",
  direction: "diagonal",
  blobCount: 4,
  dim: 0.35,
};

export function clampBackground(cfg: Partial<BackgroundConfig>): BackgroundConfig {
  return {
    mode: BACKGROUND_MODES.includes(cfg.mode as BackgroundMode) ? (cfg.mode as BackgroundMode) : DEFAULT_BACKGROUND.mode,
    palette: PALETTE_NAMES.includes(cfg.palette as PaletteName) ? (cfg.palette as PaletteName) : DEFAULT_BACKGROUND.palette,
    speed: SPEEDS.includes(cfg.speed as Speed) ? (cfg.speed as Speed) : DEFAULT_BACKGROUND.speed,
    direction: DIRECTIONS.includes(cfg.direction as Direction) ? (cfg.direction as Direction) : DEFAULT_BACKGROUND.direction,
    blobCount: Math.min(8, Math.max(2, Number(cfg.blobCount) || DEFAULT_BACKGROUND.blobCount)),
    dim: Math.min(0.85, Math.max(0, typeof cfg.dim === "number" ? cfg.dim : DEFAULT_BACKGROUND.dim)),
    imageUrl: typeof cfg.imageUrl === "string" ? cfg.imageUrl : undefined,
    rotation:
      cfg.rotation && Array.isArray(cfg.rotation.configs)
        ? {
            configs: cfg.rotation.configs.map((c) => clampBackground(c ?? {})),
            intervalSec: Math.max(5, Number(cfg.rotation.intervalSec) || 60),
          }
        : undefined,
  };
}

export function parseBackground(raw: unknown): BackgroundConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_BACKGROUND;
  return clampBackground(raw as Partial<BackgroundConfig>);
}

const SPEED_SECONDS: Record<Speed, number> = { still: 0, slow: 40, medium: 20, fast: 9 };
export function speedToSeconds(speed: Speed): number {
  return SPEED_SECONDS[speed];
}

/** A curated slice of the mode×palette×speed×direction space, for a quick-pick gallery. */
export const CURATED_BACKGROUNDS: { label: string; config: BackgroundConfig }[] = [
  { label: "Midnight drift", config: { mode: "colorBlur", palette: "midnight", speed: "slow", direction: "diagonal", blobCount: 4, dim: 0.35 } },
  { label: "Aurora sweep", config: { mode: "colorBlur", palette: "aurora", speed: "medium", direction: "horizontal", blobCount: 5, dim: 0.3 } },
  { label: "Sunset bloom", config: { mode: "colorBlur", palette: "sunset", speed: "slow", direction: "radial", blobCount: 3, dim: 0.25 } },
  { label: "Ocean deep", config: { mode: "gradient", palette: "ocean", speed: "still", direction: "diagonal", blobCount: 2, dim: 0.2 } },
  { label: "Ember glow", config: { mode: "colorBlur", palette: "ember", speed: "fast", direction: "radial", blobCount: 6, dim: 0.4 } },
  { label: "Forest calm", config: { mode: "gradient", palette: "forest", speed: "slow", direction: "vertical", blobCount: 2, dim: 0.3 } },
  { label: "Blossom haze", config: { mode: "colorBlur", palette: "blossom", speed: "medium", direction: "diagonal", blobCount: 5, dim: 0.35 } },
  { label: "Slate minimal", config: { mode: "solid", palette: "slate", speed: "still", direction: "diagonal", blobCount: 2, dim: 0 } },
  { label: "Weather-reactive", config: { mode: "weatherBlur", palette: "ocean", speed: "medium", direction: "diagonal", blobCount: 4, dim: 0.35 } },
  { label: "Now playing blur", config: { mode: "musicBlur", palette: "blossom", speed: "fast", direction: "radial", blobCount: 5, dim: 0.4 } },
  {
    label: "Rotating showcase",
    config: {
      mode: "rotate",
      palette: "midnight",
      speed: "slow",
      direction: "diagonal",
      blobCount: 4,
      dim: 0.35,
      rotation: {
        intervalSec: 120,
        configs: [
          { mode: "colorBlur", palette: "aurora", speed: "slow", direction: "diagonal", blobCount: 4, dim: 0.3 },
          { mode: "colorBlur", palette: "sunset", speed: "medium", direction: "radial", blobCount: 4, dim: 0.3 },
          { mode: "colorBlur", palette: "arctic", speed: "slow", direction: "horizontal", blobCount: 4, dim: 0.3 },
        ],
      },
    },
  },
];

/** Deterministic pseudo-random config generator — the "hundreds of options" dial. */
export function randomBackground(seed = Math.random()): BackgroundConfig {
  const pick = <T,>(arr: readonly T[], s: number) => arr[Math.floor(s * arr.length) % arr.length];
  let s = seed;
  const next = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const mode = pick(BACKGROUND_MODES.filter((m) => m !== "image" && m !== "rotate"), next());
  return clampBackground({
    mode,
    palette: pick(PALETTE_NAMES, next()),
    speed: pick(SPEEDS, next()),
    direction: pick(DIRECTIONS, next()),
    blobCount: 2 + Math.floor(next() * 7),
    dim: Math.round(next() * 50) / 100,
  });
}
