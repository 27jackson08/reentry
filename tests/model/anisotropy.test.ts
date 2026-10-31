import { describe, expect, test } from 'vitest';
import { diffusionTensor } from '../../src/model/anisotropy';
import {
  createSheet,
  divDGrad,
  laplacian9,
  stepSheet,
  stimulateRect,
} from '../../src/model/cpuSolver';
import { presetById } from '../../src/model/presets';

const preset = presetById('set1');

function cableCv(fibreAngle: number, ratio: number): number {
  const n = 160;
  let cable = createSheet(n, 1, preset.dx);
  cable = stimulateRect(cable, 0, 2, 0, 0, 0.5, 2);
  const probes = [40, 120];
  const arrival: number[] = [];
  let t = 0;
  for (let s = 0; s < 6000 && arrival.length < 2; s++) {
    cable = stepSheet(cable, preset.params, preset.dt, preset.diffusion, {
      ratio,
      angleDeg: fibreAngle,
    });
    t += preset.dt;
    if ((cable.u[probes[arrival.length]!] ?? 0) > 0.5) arrival.push(t);
  }
  return ((probes[1]! - probes[0]!) * preset.dx) / (arrival[1]! - arrival[0]!);
}

describe('anisotropy', () => {
  test('ratio 1 is the isotropic tensor regardless of angle', () => {
    const t = diffusionTensor(0.001, { ratio: 1, angleDeg: 37 });
    expect(t.dxx).toBeCloseTo(0.001, 12);
    expect(t.dyy).toBeCloseTo(0.001, 12);
    expect(t.dxy).toBeCloseTo(0, 12);
  });

  test('fibres along x: Dxx = D, Dyy = D/ratio; rotated 90° they swap', () => {
    const along = diffusionTensor(0.001, { ratio: 4, angleDeg: 0 });
    expect(along.dxx).toBeCloseTo(0.001);
    expect(along.dyy).toBeCloseTo(0.00025);
    const across = diffusionTensor(0.001, { ratio: 4, angleDeg: 90 });
    expect(across.dxx).toBeCloseTo(0.00025);
    expect(across.dyy).toBeCloseTo(0.001);
  });

  test('divDGrad reduces to D times the 5-point Laplacian when isotropic', () => {
    const n = 9;
    const sheet = createSheet(n, n, 0.5);
    const u = new Float32Array(n * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) u[j * n + i] = (i * 0.5) ** 2 + 2 * (j * 0.5) ** 2;
    const s = { ...sheet, u };
    expect(divDGrad(s, 4, 4, 1, { ratio: 1, angleDeg: 0 })).toBeCloseTo(6, 5);
    expect(laplacian9(s, 4, 4)).toBeCloseTo(6, 5);
  });

  test('conduction is faster along fibres than across, by about √ratio', () => {
    const along = cableCv(0, 4);
    const across = cableCv(90, 4);
    expect(along).toBeGreaterThan(across * 1.6);
    expect(along).toBeLessThan(across * 2.4);
  });
});
