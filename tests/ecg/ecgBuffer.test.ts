import { describe, expect, test } from 'vitest';
import { pushSample } from '../../src/ecg/ecgBuffer';

describe('ecg buffer', () => {
  test('keeps samples inside the window and drops older ones', () => {
    let s = pushSample([], { t: 0, phi: 1 }, 100);
    s = pushSample(s, { t: 50, phi: 2 }, 100);
    s = pushSample(s, { t: 120, phi: 3 }, 100);
    expect(s.map((x) => x.t)).toEqual([50, 120]);
  });

  test('does not mutate the input', () => {
    const a = [{ t: 0, phi: 0 }];
    const b = pushSample(a, { t: 1, phi: 1 }, 10);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
  });
});
