/**
 * A scar mask from an image: dark opaque pixels are scar, everything else
 * tissue. Lets an LGE-MRI segmentation (or any drawing) be dropped on the
 * sheet. Nearest-neighbour resample; image rows run top-down, grid rows
 * bottom-up.
 */

const SCAR_LUMINANCE = 128;
const OPAQUE = 128;

export function maskFromImage(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  size: number,
): Uint8Array {
  const mask = new Uint8Array(size * size).fill(1);
  for (let j = 0; j < size; j++) {
    const y = Math.min(height - 1, Math.floor(((size - 1 - j) / size) * height));
    for (let i = 0; i < size; i++) {
      const x = Math.min(width - 1, Math.floor((i / size) * width));
      const k = (y * width + x) * 4;
      const lum =
        0.2126 * (rgba[k] ?? 0) + 0.7152 * (rgba[k + 1] ?? 0) + 0.0722 * (rgba[k + 2] ?? 0);
      const opaque = (rgba[k + 3] ?? 0) >= OPAQUE;
      if (opaque && lum < SCAR_LUMINANCE) mask[j * size + i] = 0;
    }
  }
  return mask;
}
