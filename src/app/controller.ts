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
import {
  extractU,
  findPhaseSingularities,
  mergeSingularities,
  PHASE_DELAY_MS,
  type Singularity,
} from '../analysis/phaseSingularities';
import { pushSample } from '../ecg/ecgBuffer';
import type { PacingConfig } from '../protocol/pacing';
import { ISOTROPIC, type Fibres } from '../model/anisotropy';

export type TissueStatus = 'quiescent' | 'inducing' | 'active' | 'induction failed';
export type Tool = 'stimulate' | 'scar' | 'erase';

const ACTIVE_THRESHOLD = 0.5;
const SHOCK_DURATION_MS = 5;
/** 10 ms of simulated time per frame: 0.6× real time at 60 fps on a mid-range GPU. Auto-throttled in main.ts. */
const DEFAULT_MS_PER_FRAME = 10;
export const ECG_WINDOW_MS = 4000;
/** While S1-S2 is waiting on the probe, step in short chunks so S2 timing does not depend on playback speed. */
const PROTOCOL_CHUNK_MS = 2;
const DEFAULT_BRUSH = 0.04;
const DEFAULT_PACING_SITE = { cx: 0.2, cy: 0.8, rx: 0.03, ry: 0.03 } as const;
const DEFAULT_PACING_BEATS = 10;
const PACING_CURRENT = 0.3;
const PACING_DURATION_MS = 2;
const ELECTRODE: Electrode = { x: 0.5, y: 0.5, heightCm: 2 };

export class AppController {
  readonly sim: Simulation;
  running = true;
  /** Simulated milliseconds advanced per animation frame; steps follow from the preset's dt. */
  msPerFrame = DEFAULT_MS_PER_FRAME;
  view: ViewMode = 'voltage';
  shockCurrent = 0.3;
  /** Antitachycardia pacing cycle length. Set a little under the rotor's period. */
  pacingCycleMs = 300;
  pacingBeats = DEFAULT_PACING_BEATS;
  pacingSite: {
    readonly cx: number;
    readonly cy: number;
    readonly rx: number;
    readonly ry: number;
  } = DEFAULT_PACING_SITE;
  tool: Tool = 'stimulate';
  /** Tests step deterministically and read the probe synchronously. */
  syncProbe = false;
  brushRadius = DEFAULT_BRUSH;
  private protocol: S1S2State | null = null;
  private _strokes: readonly Stroke[] = [];
  private mask: Uint8Array;
  activity = 0;
  /** Simulated ms advanced during the last tick, for the ms/s readout. */
  lastTickMs = 0;
  /** Most recent pseudo-ECG sample, or null before the first tick. */
  lastEcg: EcgSample | null = null;
  private _ecgSamples: readonly EcgSample[] = [];
  /** Mean-u snapshots for the time-delay phase, newest last. */
  private probeHistory: readonly { readonly t: number; readonly u: Float32Array }[] = [];
  private _rotors: readonly Singularity[] = [];

  constructor(sim: Simulation, strokes: readonly Stroke[] = [], fibres: Fibres = ISOTROPIC) {
    this.sim = sim;
    this.mask = tissueMask(sim.size);
    if (strokes.length > 0) this.setStrokes(strokes);
    this.sim.setFibres(fibres);
  }

  get fibres(): Fibres {
    return this.sim.currentFibres;
  }

  setFibres(fibres: Fibres): void {
    this.sim.setFibres(fibres);
  }

  /** Whether the mask came from an image rather than strokes (not shareable by link). */
  maskFromImage = false;

  get preset(): Preset {
    return this.sim.currentPreset;
  }

  get strokes(): readonly Stroke[] {
    return this._strokes;
  }

  /** Pseudo-ECG samples inside the last ECG_WINDOW_MS. */
  get ecgSamples(): readonly EcgSample[] {
    return this._ecgSamples;
  }

  /** Phase singularities found on the last probe: rotor tips. */
  get rotors(): readonly Singularity[] {
    return this._rotors;
  }

  get stepsPerFrame(): number {
    return Math.max(1, Math.round(this.msPerFrame / this.sim.dt));
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
    this._ecgSamples = [];
    this.probeHistory = [];
    this._rotors = [];
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

  /** Incremented on every shock so the UI can flash without an event bus. */
  shockCount = 0;

  shock(): void {
    this.sim.applyShock(this.shockCurrent, SHOCK_DURATION_MS);
    this.shockCount++;
  }

  /** Burst of PACING_BEATS stimuli at `pacingCycleMs` from a fixed site: antitachycardia pacing. */
  pace(): void {
    const config: PacingConfig = {
      site: this.pacingSite,
      cycleLengthMs: this.pacingCycleMs,
      beats: this.pacingBeats,
      current: PACING_CURRENT,
      durationMs: PACING_DURATION_MS,
    };
    this.sim.startPacing(config);
    this.running = true;
  }

  get isPacing(): boolean {
    return this.sim.isPacing;
  }

  /** Replace the scar with a mask derived from an image. Strokes are cleared. */
  setMaskDirect(mask: Uint8Array): void {
    this._strokes = [];
    this.mask = mask;
    this.maskFromImage = true;
    this.sim.setMask(this.mask);
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
    this.maskFromImage = false;
    this.sim.setMask(this.mask);
  }

  clearScar(): void {
    this.setStrokes([]);
  }

  /** A round scar where the S1-S2 tip forms: the rotor anchors and turns around it (anatomical reentry). */
  presetScar(): void {
    this.addScarStroke({ x: 0.4, y: 0.5, r: 0.06, erase: false });
  }

  /** Advance the simulation by one animation frame's worth of steps. */
  tick(): void {
    this.lastTickMs = 0;
    if (!this.running) return;
    if (this.isInducing) {
      this.tickInducing();
      return;
    }
    const steps = this.stepsPerFrame;
    this.sim.step(steps);
    this.lastTickMs = steps * this.sim.dt;
    if (this.syncProbe) {
      this.readProbe(this.sim.probe(), this.sim.timeMs);
      return;
    }
    const result = this.sim.probeAsync();
    if (result) this.readProbe(result.data, result.timeMs);
  }

  /** Current S1-S2 phase, or null when no protocol has run since reset. */
  get protocolPhase(): S1S2State['phase'] | null {
    return this.protocol?.phase ?? null;
  }

  private get isInducing(): boolean {
    return (
      this.protocol !== null && this.protocol.phase !== 'done' && this.protocol.phase !== 'failed'
    );
  }

  /** Same simulated time per frame, but probed synchronously every PROTOCOL_CHUNK_MS. */
  private tickInducing(): void {
    const chunkSteps = Math.max(1, Math.round(PROTOCOL_CHUNK_MS / this.sim.dt));
    let remaining = this.stepsPerFrame;
    while (remaining > 0) {
      const steps = Math.min(chunkSteps, remaining);
      this.sim.step(steps);
      remaining -= steps;
      this.lastTickMs += steps * this.sim.dt;
      this.readProbe(this.sim.probe(), this.sim.timeMs);
      if (!this.isInducing) break;
    }
    if (remaining > 0) {
      this.sim.step(remaining);
      this.lastTickMs += remaining * this.sim.dt;
    }
  }

  /** `probeTimeMs` is when the probe was taken, which trails the clock on the async path. */
  private readProbe(probe: Float32Array, probeTimeMs: number): void {
    // An async readback issued before the last synchronous (induction) probe is stale.
    if (this.lastEcg && probeTimeMs <= this.lastEcg.t) return;
    this.activity = activeFraction(probe, PROBE_SIZE, ACTIVE_THRESHOLD);
    this.lastEcg = {
      t: probeTimeMs,
      phi: pseudoEcg(probe, PROBE_SIZE, this.sim.sideCm, ELECTRODE),
    };
    this._ecgSamples = pushSample(this._ecgSamples, this.lastEcg, ECG_WINDOW_MS);
    this.updateRotors(probe, probeTimeMs);
    if (this.protocol) {
      const u = probeMeanU(probe, PROBE_SIZE, DEFAULT_S1S2.probeSite.x, DEFAULT_S1S2.probeSite.y);
      const { state, actions } = advanceS1S2(this.protocol, DEFAULT_S1S2, probeTimeMs, u);
      this.protocol = state;
      this.apply(actions);
    }
  }

  private updateRotors(probe: Float32Array, now: number): void {
    const snapshot = { t: now, u: extractU(probe, PROBE_SIZE) };
    // Keep just enough history to reach back PHASE_DELAY_MS.
    const kept = this.probeHistory.filter((h) => now - h.t <= PHASE_DELAY_MS * 2);
    this.probeHistory = [...kept, snapshot];
    // Newest snapshot that is at least PHASE_DELAY_MS old (history is oldest first).
    const past = [...this.probeHistory].reverse().find((h) => now - h.t >= PHASE_DELAY_MS);
    this._rotors =
      past && this.activity > 0
        ? mergeSingularities(findPhaseSingularities(probe, past.u, PROBE_SIZE), PROBE_SIZE)
        : [];
  }

  render(width: number, height: number): void {
    this.sim.render(this.view, width, height);
  }

  private apply(actions: readonly StimulateAction[]): void {
    for (const a of actions) this.sim.stimulate(a.shape, a.current, a.durationMs);
  }
}
