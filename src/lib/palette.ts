export const NEUTRAL_ACCENT = "#f0b38a";

export interface Palette {
  /** Vivid accent that reads on black. */
  accent: string;
  /** Up to four distinct, vivid colours really in the artwork (hex), most dominant first: for lights. */
  palette: string[];
  /** the artwork has no real colour (black and white): lights should go white */
  mono: boolean;
  /** average brightness of the artwork, 0 (black) to 1 (white) */
  lum: number;
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)].map((x) => Math.round(x * 255)) as [number, number, number];
}

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;

/** Colours of an artwork from its RGBA pixels (a 160x160 copy is plenty). Used by the screens (canvas) and by the
 *  server (sharp), so the lights and the on-screen accent always agree.
 *
 *  A 12-bucket hue histogram weighted by saturation x brightness gives the accent (clamped to s 0.55, v 0.95 so it reads on
 *  black). For the lights, hues are grouped into clusters (anything within 30 degrees is the same colour, so a yellow cover
 *  with some orange stays ONE yellow), and a cluster only counts if it is a meaningful share of the picture's colour. */
export function analysePixels(data: ArrayLike<number>): Palette {
  const buckets = new Array(12).fill(0);
  const fine = new Array(36).fill(0);
  const satSum = new Array(36).fill(0);
  let lumSum = 0, lumN = 0, colourful = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b; lumN++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (max === 0 || d / max < 0.15) continue;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const w = (d / max) * max;
    buckets[Math.floor(h / 30) % 12] += w;
    colourful += w;
    // for the lights: only clearly coloured, clearly lit pixels count (dark or grey noise must not invent a colour)
    if (max >= 0.25 && d / max >= 0.2) {
      const bi = Math.floor(h / 10) % 36;
      const pw = (d / max) * max;
      fine[bi] += pw;
      satSum[bi] += (d / max) * pw;
    }
  }

  let accent = NEUTRAL_ACCENT;
  if (colourful > 20) {
    const best = buckets.indexOf(Math.max(...buckets));
    accent = hex(hsvToRgb((best * 30 + 15) / 360, 0.55, 0.95));
  }

  const palette: string[] = [];
  const total = fine.reduce((a, b) => a + b, 0);
  if (colourful > 20 && total > 0) {
    const w = [...fine];
    const clusters: { weight: number; hue: number; sat: number }[] = [];
    for (let n = 0; n < 4; n++) {
      let peak = 0;
      for (let i = 1; i < 36; i++) if (w[i] > w[peak]) peak = i;
      if (w[peak] <= 0) break;
      let weight = 0, vx = 0, vy = 0, sat = 0, base = 0;
      for (let k = -3; k <= 3; k++) {
        const i = (peak + k + 36) % 36;
        const ang = ((i * 10 + 5) * Math.PI) / 180;
        weight += w[i]; vx += Math.cos(ang) * w[i]; vy += Math.sin(ang) * w[i];
        sat += satSum[i] * (w[i] / (fine[i] || 1)); base += w[i];
        w[i] = 0;
      }
      if (clusters.length && (weight < clusters[0].weight * 0.22 || weight < total * 0.07)) break;
      clusters.push({ weight, hue: ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360, sat: base > 0 ? sat / base : 0.8 });
    }
    for (const c of clusters) palette.push(hex(hsvToRgb(c.hue / 360, Math.max(0.35, Math.min(1, c.sat * 1.1)), 1)));
  }
  return { accent, palette, mono: palette.length === 0, lum: lumN ? lumSum / lumN : 0.5 };
}
