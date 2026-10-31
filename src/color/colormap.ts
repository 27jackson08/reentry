/**
 * Colormaps built in OKLCH so lightness ramps are perceptually even.
 * Generated on the CPU into a 256x1 LUT that the render shader samples.
 */

export interface Oklch {
  readonly l: number; // 0..1
  readonly c: number; // chroma, ~0..0.37
  readonly h: number; // degrees
}

export interface Stop {
  readonly at: number; // 0..1
  readonly color: Oklch;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function linearToSrgb(x: number): number {
  const c = clamp01(x);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Björn Ottosson's OKLab, via OKLCH polar coordinates, to 8-bit sRGB. */
export function oklchToSrgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  return [
    Math.round(linearToSrgb(r) * 255),
    Math.round(linearToSrgb(g) * 255),
    Math.round(linearToSrgb(bb) * 255),
  ];
}

function lerpHue(h0: number, h1: number, t: number): number {
  let d = ((h1 - h0 + 540) % 360) - 180;
  if (d === -180) d = 180;
  return (h0 + d * t + 360) % 360;
}

function interpolate(stops: readonly Stop[], t: number): Oklch {
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (t <= first.at) return first.color;
  if (t >= last.at) return last.color;
  for (let i = 1; i < stops.length; i++) {
    const s0 = stops[i - 1]!;
    const s1 = stops[i]!;
    if (t <= s1.at) {
      const f = (t - s0.at) / (s1.at - s0.at);
      return {
        l: s0.color.l + (s1.color.l - s0.color.l) * f,
        c: s0.color.c + (s1.color.c - s0.color.c) * f,
        h: lerpHue(s0.color.h, s1.color.h, f),
      };
    }
  }
  return last.color;
}

/** Build an RGBA8 LUT. `cyclic` wraps so entry 0 and entry n-1 match. */
export function buildLut(stops: readonly Stop[], size: number, cyclic = false): Uint8Array {
  const out = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const t = cyclic ? i / size : i / (size - 1);
    const [r, g, b] = oklchToSrgb(interpolate(stops, t));
    out.set([r, g, b, 255], i * 4);
  }
  if (cyclic) out.set(out.subarray(0, 4), (size - 1) * 4);
  return out;
}

/** "Ember": black rest, violet foot, crimson rise, amber crest, pale plateau. */
export const VOLTAGE_STOPS: readonly Stop[] = [
  { at: 0.0, color: { l: 0.08, c: 0.01, h: 290 } },
  { at: 0.18, color: { l: 0.25, c: 0.11, h: 300 } },
  { at: 0.42, color: { l: 0.5, c: 0.2, h: 20 } },
  { at: 0.68, color: { l: 0.72, c: 0.17, h: 55 } },
  { at: 0.88, color: { l: 0.9, c: 0.1, h: 85 } },
  { at: 1.0, color: { l: 0.97, c: 0.04, h: 95 } },
];

/** Constant-lightness hue sweep for phase: every angle equally weighted. */
export const PHASE_STOPS: readonly Stop[] = [
  { at: 0.0, color: { l: 0.7, c: 0.13, h: 0 } },
  { at: 0.25, color: { l: 0.7, c: 0.13, h: 90 } },
  { at: 0.5, color: { l: 0.7, c: 0.13, h: 180 } },
  { at: 0.75, color: { l: 0.7, c: 0.13, h: 270 } },
  { at: 1.0, color: { l: 0.7, c: 0.13, h: 360 } },
];
