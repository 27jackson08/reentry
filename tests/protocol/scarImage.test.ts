import { describe, expect, test } from 'vitest';
import { maskFromImage } from '../../src/protocol/scarImage';

function image(w: number, h: number, lum: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      const v = lum(x, y);
      data[k] = v;
      data[k + 1] = v;
      data[k + 2] = v;
      data[k + 3] = 255;
    }
  return data;
}

describe('scar from image', () => {
  test('dark pixels become scar, light pixels tissue, resampled to the grid', () => {
    const data = image(10, 10, (x) => (x < 5 ? 0 : 255));
    const mask = maskFromImage(data, 10, 10, 4);
    expect(Array.from(mask.slice(0, 4))).toEqual([0, 0, 1, 1]);
  });

  test('image rows map top-down onto the bottom-up grid', () => {
    const data = image(4, 4, (_x, y) => (y === 0 ? 0 : 255)); // top row dark
    const mask = maskFromImage(data, 4, 4, 4);
    expect(mask[3 * 4]).toBe(0); // grid row 3 is the top
    expect(mask[0]).toBe(1);
  });

  test('transparent pixels count as tissue', () => {
    const data = image(2, 2, () => 0);
    data[3] = 0; // first pixel transparent
    const mask = maskFromImage(data, 2, 2, 2);
    expect(mask[2]).toBe(1); // top-left in image = row 1 col 0 in grid
    expect(mask[3]).toBe(0);
  });
});
