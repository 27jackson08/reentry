import { describe, expect, test } from 'vitest';
import { AppController } from '../../src/app/controller';
import type { Simulation, StimulusShape } from '../../src/gpu/simulation';
import { PROBE_SIZE } from '../../src/gpu/simulation';
import { presetById, type Preset } from '../../src/model/presets';

/** A stand-in for the GPU simulation that records calls and serves a scripted probe. */
class StubSim {
  size = 32;
  timeMs = 0;
  steps = 0;
  preset: Preset = presetById('set1');
  dxOverride: number | null = null;
  stimuli: { shape: StimulusShape; current: number; durationMs: number }[] = [];
  shocks: { current: number; durationMs: number }[] = [];
  masks: Uint8Array[] = [];
  resets = 0;
  probeU = 0;
  probeMaxU = 0;

  get dt() {
    return this.preset.dt;
  }
  get currentPreset() {
    return this.preset;
  }
  get dx() {
    return this.dxOverride ?? this.preset.dx;
  }
  get sideCm() {
    return this.dx * this.size;
  }
  setPreset(p: Preset) {
    this.preset = p;
  }
  setDx(dx: number | null) {
    this.dxOverride = dx;
  }
  reset() {
    this.resets++;
    this.timeMs = 0;
  }
  setMask(mask: Uint8Array) {
    this.masks.push(mask);
  }
  stimulate(shape: StimulusShape, current: number, durationMs: number) {
    this.stimuli.push({ shape, current, durationMs });
  }
  applyShock(current: number, durationMs: number) {
    this.shocks.push({ current, durationMs });
  }
  step(n: number) {
    this.steps += n;
    this.timeMs += n * this.dt;
  }
  probe() {
    const buf = new Float32Array(PROBE_SIZE * PROBE_SIZE * 4);
    for (let k = 0; k < PROBE_SIZE * PROBE_SIZE; k++) {
      buf[k * 4] = this.probeU;
      buf[k * 4 + 1] = this.probeMaxU;
      buf[k * 4 + 3] = 1;
    }
    return buf;
  }
  render() {}
  readState() {
    return new Float32Array(0);
  }
}

const make = () => {
  const sim = new StubSim();
  return { sim, app: new AppController(sim as unknown as Simulation) };
};

describe('AppController', () => {
  test('starts quiescent with no strokes and the simulation preset', () => {
    const { app } = make();
    expect(app.status).toBe('quiescent');
    expect(app.strokes).toEqual([]);
    expect(app.preset.id).toBe('set1');
  });

  test('tick steps the simulation, reads the probe, and reports activity', () => {
    const { sim, app } = make();
    app.stepsPerFrame = 5;
    sim.probeMaxU = 0.9;
    app.tick();
    expect(sim.steps).toBe(5);
    expect(app.lastTickMs).toBeCloseTo(5 * sim.dt);
    expect(app.activity).toBe(1);
    expect(app.status).toBe('active');
    expect(app.lastEcg?.t).toBeCloseTo(sim.timeMs);
  });

  test('tick does nothing while paused', () => {
    const { sim, app } = make();
    app.running = false;
    app.tick();
    expect(sim.steps).toBe(0);
    expect(app.lastTickMs).toBe(0);
  });

  test('induce fires S1, then S2 once the probe sees upstroke and wave back', () => {
    const { sim, app } = make();
    app.induce();
    expect(sim.stimuli).toHaveLength(1);
    expect(app.status).toBe('inducing');
    sim.probeU = 0.9;
    app.tick();
    expect(sim.stimuli).toHaveLength(1);
    sim.probeU = 0.2;
    app.tick();
    expect(sim.stimuli).toHaveLength(2);
    expect(app.status).not.toBe('inducing');
  });

  test('induction fails after the timeout with no wave', () => {
    const { sim, app } = make();
    app.induce();
    app.stepsPerFrame = 40;
    sim.probeU = 0;
    for (let i = 0; i < 1000; i++) app.tick();
    expect(app.status).toBe('induction failed');
  });

  test('shock uses the configured current for 5 ms', () => {
    const { sim, app } = make();
    app.shockCurrent = 0.42;
    app.shock();
    expect(sim.shocks).toEqual([{ current: 0.42, durationMs: 5 }]);
  });

  test('paint stimulates in stimulate mode and paints strokes in scar/erase modes', () => {
    const { sim, app } = make();
    app.paint(0.3, 0.4);
    expect(sim.stimuli).toHaveLength(1);
    expect(sim.masks).toHaveLength(0);
    app.tool = 'scar';
    app.paint(0.5, 0.5);
    app.tool = 'erase';
    app.paint(0.5, 0.5);
    expect(app.strokes).toHaveLength(2);
    expect(app.strokes[1]!.erase).toBe(true);
    expect(sim.masks).toHaveLength(2);
    expect(sim.masks[0]![16 * 32 + 16]).toBe(0);
    expect(sim.masks[1]![16 * 32 + 16]).toBe(1);
  });

  test('strokes are immutable snapshots', () => {
    const { app } = make();
    app.tool = 'scar';
    const before = app.strokes;
    app.paint(0.5, 0.5);
    expect(before).toHaveLength(0);
    expect(app.strokes).toHaveLength(1);
  });

  test('presetScar, clearScar and constructor strokes upload masks', () => {
    const sim = new StubSim();
    const app = new AppController(sim as unknown as Simulation, [
      { x: 0.5, y: 0.5, r: 0.2, erase: false },
    ]);
    expect(sim.masks).toHaveLength(1);
    app.presetScar();
    expect(app.strokes).toHaveLength(2);
    app.clearScar();
    expect(app.strokes).toHaveLength(0);
    expect(sim.masks.at(-1)!.every((m) => m === 1)).toBe(true);
  });

  test('reset clears protocol, activity and ECG', () => {
    const { sim, app } = make();
    sim.probeMaxU = 1;
    app.induce();
    app.tick();
    app.reset();
    expect(sim.resets).toBe(1);
    expect(app.activity).toBe(0);
    expect(app.lastEcg).toBeNull();
    expect(app.status).toBe('quiescent');
  });

  test('setPreset and planeWave delegate to the simulation', () => {
    const { sim, app } = make();
    app.setPreset('set10');
    expect(app.preset.id).toBe('set10');
    app.planeWave();
    expect(sim.stimuli[0]!.shape.kind).toBe('rect');
  });
});
