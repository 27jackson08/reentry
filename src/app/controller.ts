/**
 * Owns the simulation, the per-frame probe readback, the scar mask, the
 * pseudo-ECG samples and the running protocol. UI modules call its methods;
 * it never touches the DOM.
 */
import { PROBE_SIZE, type Simulation, type ViewMode } from '../gpu/simulation';
import { presetById, type Preset } from '../model/presets';
import { activeFraction, probeMeanU } from '../protocol/probeStats';
import {
  advanceS1S2,
  DEFAULT_S1S2,
  startS1S2,
  type S1S2State,
  type StimulateAction,
} from '../protocol/s1s2';
import { addStroke, applyStroke, rasterize, tissueMask, type Stroke } from '../protocol/scar';
import { pseudoEcg, type Electrode } from '../ecg/pseudoEcg';
import type { EcgSample } from '../ecg/EcgTrace';

export type TissueStatus = 'quiescent' | 'inducing' | 'active' | 'induction failed';
export type Tool = 'stimulate' | 'scar' | 'erase';

const ACTIVE_THRESHOLD = 0.5;
const SHOCK_DURATION_MS = 5;
const DEFAULT_STEPS_PER_FRAME = 10;
const DEFAULT_BRUSH = 0.04;
const ELECTRODE: Electrode = { x: 0.5, y: 0.5, heightCm: 2 };

export class AppController {
  readonly sim: Simulation;
  running = true;
  stepsPerFrame = DEFAULT_STEPS_PER_FRAME;
  view: ViewMode = 'voltage';
  shockCurrent = 0.3;
  tool: Tool = 'stimulate';
  brushRadius = DEFAULT_BRUSH;
  private protocol: S1S2State | null = null;
  private probe: Float32Array | null = null;
  private _strokes: readonly Stroke[] = [];
  private mask: Uint8Array;
  activity = 0;
  /** Simulated ms advanced during the last tick, for the ms/s readout. */
  lastTickMs = 0;
  /** Most recent pseudo-ECG sample, or null before the first tick. */
  lastEcg: EcgSample | null = null;

  constructor(sim: Simulation, strokes: readonly Stroke[] = []) {
    this.sim = sim;
    this.mask = tissueMask(sim.size);
    if (strokes.length > 0) this.setStrokes(strokes);
  }

  get preset(): Preset {
    return this.sim.currentPreset;
  }

  get strokes(): readonly Stroke[] {
    return this._strokes;
  }

  get status(): TissueStatus {
    if (this.protocol && this.protocol.phase !== 'done' && this.protocol.phase !== 'failed')
      return 'inducing';
    if (this.protocol?.phase === 'failed') return 'induction failed';
    return this.activity > 0 ? 'active' : 'quiescent';
  }

  setPreset(id: string): void {
    this.sim.setPreset(presetById(id));
  }

  reset(): void {
    this.sim.reset();
    this.protocol = null;
    this.activity = 0;
    this.lastEcg = null;
  }

  planeWave(): void {
    const { s1, current, durationMs } = DEFAULT_S1S2;
    this.sim.stimulate(s1, current, durationMs);
  }

  pointStimulus(cx: number, cy: number, radius = 0.03): void {
    this.sim.stimulate(
      { kind: 'ellipse', cx, cy, rx: radius, ry: radius },
      DEFAULT_S1S2.current,
      DEFAULT_S1S2.durationMs,
    );
  }

  induce(): void {
    const { state, actions } = startS1S2(DEFAULT_S1S2, this.sim.timeMs);
    this.protocol = state;
    this.apply(actions);
    this.running = true;
  }

  shock(): void {
    this.sim.applyShock(this.shockCurrent, SHOCK_DURATION_MS);
  }

  /** Apply the current tool at a uv position (pointer down or drag). */
  paint(x: number, y: number): void {
    if (this.tool === 'stimulate') {
      this.pointStimulus(x, y);
      return;
    }
    this.addScarStroke({ x, y, r: this.brushRadius, erase: this.tool === 'erase' });
  }

  addScarStroke(stroke: Stroke): void {
    this._strokes = addStroke(this._strokes, stroke);
    this.mask = applyStroke(this.mask, stroke, this.sim.size);
    this.sim.setMask(this.mask);
  }

  setStrokes(strokes: readonly Stroke[]): void {
    this._strokes = strokes.slice();
    this.mask = rasterize(this._strokes, this.sim.size);
    this.sim.setMask(this.mask);
  }

  clearScar(): void {
    this.setStrokes([]);
  }

  /** A round scar near the centre: the anchoring demo. */
  presetScar(): void {
    this.addScarStroke({ x: 0.62, y: 0.55, r: 0.07, erase: false });
  }

  /** Advance the simulation by one animation frame's worth of steps. */
  tick(): void {
    this.lastTickMs = 0;
    if (!this.running || this.stepsPerFrame === 0) return;
    this.sim.step(this.stepsPerFrame);
    this.lastTickMs = this.stepsPerFrame * this.sim.dt;
    this.probe = this.sim.probe();
    this.activity = activeFraction(this.probe, PROBE_SIZE, ACTIVE_THRESHOLD);
    this.lastEcg = {
      t: this.sim.timeMs,
      phi: pseudoEcg(this.probe, PROBE_SIZE, this.sim.sideCm, ELECTRODE),
    };
    if (this.protocol) {
      const u = probeMeanU(
        this.probe,
        PROBE_SIZE,
        DEFAULT_S1S2.probeSite.x,
        DEFAULT_S1S2.probeSite.y,
      );
      const { state, actions } = advanceS1S2(this.protocol, DEFAULT_S1S2, this.sim.timeMs, u);
      this.protocol = state;
      this.apply(actions);
    }
  }

  render(width: number, height: number): void {
    this.sim.render(this.view, width, height);
  }

  private apply(actions: readonly StimulateAction[]): void {
    for (const a of actions) this.sim.stimulate(a.shape, a.current, a.durationMs);
  }
}
