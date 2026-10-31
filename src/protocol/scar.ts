/**
 * Scar as a list of brush strokes. Strokes are the source of truth (compact,
 * shareable in a URL, deterministic); the mask is derived. Everything here is
 * pure and returns new values.
 */

export interface Stroke {
  /** Centre in uv (0..1), origin bottom-left to match the texture. */
  readonly x: number;
  readonly y: number;
  /** Radius in uv. */
  readonly r: number;
  readonly erase: boolean;
}

export const MAX_STROKES = 600;
export const MIN_RADIUS = 0.005;
export const MAX_RADIUS = 0.3;

export function tissueMask(size: number): Uint8Array {
  return new Uint8Array(size * size).fill(1);
}

/** Paint one stroke onto a copy of `mask`. */
export function applyStroke(mask: Uint8Array, stroke: Stroke, size: number): Uint8Array {
  const out = Uint8Array.from(mask);
  paintInto(out, stroke, size);
  return out;
}

export function rasterize(strokes: readonly Stroke[], size: number): Uint8Array {
  const out = tissueMask(size);
  for (const s of strokes) paintInto(out, s, size);
  return out;
}

function paintInto(out: Uint8Array, stroke: Stroke, size: number): void {
  const value = stroke.erase ? 1 : 0;
  const cx = stroke.x * size;
  const cy = stroke.y * size;
  const r = stroke.r * size;
  const i0 = Math.max(0, Math.floor(cx - r - 1));
  const i1 = Math.min(size - 1, Math.ceil(cx + r + 1));
  const j0 = Math.max(0, Math.floor(cy - r - 1));
  const j1 = Math.min(size - 1, Math.ceil(cy + r + 1));
  const r2 = r * r;
  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - cy;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) out[j * size + i] = value;
    }
  }
}

export function addStroke(strokes: readonly Stroke[], stroke: Stroke): readonly Stroke[] {
  const next = [...strokes, stroke];
  return next.length > MAX_STROKES ? next.slice(next.length - MAX_STROKES) : next;
}

// URL encoding: five base64url characters per stroke. Four carry x and y at
// 12 bits each; the fifth carries a 5-bit radius index and the erase flag.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const CHARS_PER_STROKE = 5;
const COORD_BITS = 12;
const COORD_MAX = (1 << COORD_BITS) - 1;
const RADIUS_STEPS = 31;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function encodeStrokes(strokes: readonly Stroke[]): string {
  const kept = strokes.slice(-MAX_STROKES);
  let out = '';
  for (const s of kept) {
    const x = Math.round(clamp(s.x, 0, 1) * COORD_MAX);
    const y = Math.round(clamp(s.y, 0, 1) * COORD_MAX);
    const r = Math.round(
      ((clamp(s.r, MIN_RADIUS, MAX_RADIUS) - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS)) *
        RADIUS_STEPS,
    );
    const packed = (x << 12) | y; // 24 bits
    const tail = (r << 1) | (s.erase ? 1 : 0); // 6 bits
    out +=
      ALPHABET[(packed >> 18) & 63]! +
      ALPHABET[(packed >> 12) & 63]! +
      ALPHABET[(packed >> 6) & 63]! +
      ALPHABET[packed & 63]! +
      ALPHABET[tail]!;
  }
  return out;
}

export function decodeStrokes(text: string): Stroke[] {
  if (text.length % CHARS_PER_STROKE !== 0) return [];
  const strokes: Stroke[] = [];
  for (
    let k = 0;
    k + CHARS_PER_STROKE <= text.length && strokes.length < MAX_STROKES;
    k += CHARS_PER_STROKE
  ) {
    const digits: number[] = [];
    for (let c = 0; c < CHARS_PER_STROKE; c++) {
      const d = ALPHABET.indexOf(text[k + c]!);
      if (d < 0) return [];
      digits.push(d);
    }
    const packed = (digits[0]! << 18) | (digits[1]! << 12) | (digits[2]! << 6) | digits[3]!;
    const tail = digits[4]!;
    strokes.push({
      x: ((packed >> 12) & COORD_MAX) / COORD_MAX,
      y: (packed & COORD_MAX) / COORD_MAX,
      r: MIN_RADIUS + ((tail >> 1) / RADIUS_STEPS) * (MAX_RADIUS - MIN_RADIUS),
      erase: (tail & 1) === 1,
    });
  }
  return strokes;
}
