/**
 * GPU Fenton-Karma sheet: owns the ping-pong state textures, the mask, the
 * step/render/probe programs and the stimulus/shock schedule.
 */
import { REST, type FkParams } from '../model/fentonKarma';
import {
  advancePacing,
  startPacing,
  type PacingConfig,
  type PacingState,
} from '../protocol/pacing';
import { diffusionTensor, type Fibres } from '../model/anisotropy';
import type { Preset } from '../model/presets';
import { buildLut, PHASE_STOPS, VOLTAGE_STOPS } from '../color/colormap';
import { createProgram, drawFullscreen, type Program } from './programs';
import {
  createFloatTarget,
  createLutTexture,
  createMaskTexture,
  PingPong,
  uploadFloatTarget,
  uploadMaskTexture,
  type RenderTarget,
} from './textures';
import quadVert from './shaders/quad.vert?raw';
import stepFrag from './shaders/step.frag?raw';
import renderFrag from './shaders/render.frag?raw';
import probeFrag from './shaders/probe.frag?raw';

export type StimulusShape =
  | {
      readonly kind: 'rect';
      readonly x0: number;
      readonly y0: number;
      readonly x1: number;
      readonly y1: number;
    }
  | {
      readonly kind: 'ellipse';
      readonly cx: number;
      readonly cy: number;
      readonly rx: number;
      readonly ry: number;
    };

export interface Stimulus {
  readonly shape: StimulusShape;
  readonly current: number;
  readonly remainingMs: number;
}

export interface Shock {
  readonly current: number;
  readonly remainingMs: number;
}

export type ViewMode = 'voltage' | 'phase' | 'gates';
const VIEW_INDEX: Record<ViewMode, number> = { voltage: 0, phase: 1, gates: 2 };

export const PROBE_SIZE = 64;

export interface ProbeResult {
  readonly data: Float32Array;
  /** Simulated time the probe was taken at (earlier than now for the async path). */
  readonly timeMs: number;
}

const invRate = (tau: number) => (Number.isFinite(tau) ? 1 / tau : 0);

export class Simulation {
  readonly size: number;
  private readonly gl: WebGL2RenderingContext;
  private readonly state: PingPong;
  private readonly maskTexture: WebGLTexture;
  private readonly probeTarget: RenderTarget;
  private readonly stepProgram: Program;
  private readonly renderProgram: Program;
  private readonly probeProgram: Program;
  private readonly voltageLut: WebGLTexture;
  private readonly phaseLut: WebGLTexture;
  private readonly vao: WebGLVertexArrayObject;
  private readonly probeBuffer: Float32Array;
  private readonly probePbo: WebGLBuffer;
  private probeFence: WebGLSync | null = null;
  /** Simulated time at which the in-flight readback was issued. */
  private probeIssuedAtMs = 0;

  private preset: Preset;
  private mask: Uint8Array;
  /** Grid spacing in cm; overrides the preset's dx when set. */
  private dxOverride: number | null = null;
  private stimulus: Stimulus | null = null;
  private shock: Shock | null = null;
  private pacing: PacingState | null = null;
  private lastPacingConfig: PacingConfig | null = null;
  private fibres: Fibres = { ratio: 1, angleDeg: 0 };
  private _timeMs = 0;
  private _steps = 0;

  constructor(gl: WebGL2RenderingContext, preset: Preset, size: number) {
    this.gl = gl;
    this.size = size;
    this.preset = preset;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('createVertexArray returned null');
    this.vao = vao;
    this.mask = new Uint8Array(size * size).fill(1);
    this.state = new PingPong(gl, size, size, restState(size, this.mask));
    this.maskTexture = createMaskTexture(gl, size, size, this.mask);
    this.probeTarget = createFloatTarget(gl, PROBE_SIZE, PROBE_SIZE);
    this.probeBuffer = new Float32Array(PROBE_SIZE * PROBE_SIZE * 4);
    const pbo = gl.createBuffer();
    if (!pbo) throw new Error('createBuffer returned null');
    this.probePbo = pbo;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, this.probeBuffer.byteLength, gl.DYNAMIC_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.stepProgram = createProgram(gl, quadVert, stepFrag);
    this.renderProgram = createProgram(gl, quadVert, renderFrag);
    this.probeProgram = createProgram(gl, quadVert, probeFrag);
    this.voltageLut = createLutTexture(gl, buildLut(VOLTAGE_STOPS, 256));
    this.phaseLut = createLutTexture(gl, buildLut(PHASE_STOPS, 256, true));
  }

  get timeMs(): number {
    return this._timeMs;
  }

  get steps(): number {
    return this._steps;
  }

  get dt(): number {
    return this.preset.dt;
  }

  get currentPreset(): Preset {
    return this.preset;
  }

  setPreset(preset: Preset): void {
    this.preset = preset;
  }

  get dx(): number {
    return this.dxOverride ?? this.preset.dx;
  }

  /** Physical side length of the sheet in cm. */
  get sideCm(): number {
    return this.dx * this.size;
  }

  setDx(dx: number | null): void {
    this.dxOverride = dx;
  }

  /** Return every cell to rest, keeping the mask. */
  reset(): void {
    uploadFloatTarget(this.gl, this.state.read, restState(this.size, this.mask));
    uploadFloatTarget(this.gl, this.state.write, restState(this.size, this.mask));
    this.stimulus = null;
    this.shock = null;
    this.pacing = null;
    this._timeMs = 0;
    this._steps = 0;
  }

  setMask(mask: Uint8Array): void {
    if (mask.length !== this.size * this.size) {
      throw new Error(`mask has ${mask.length} cells, expected ${this.size * this.size}`);
    }
    this.mask = Uint8Array.from(mask);
    uploadMaskTexture(this.gl, this.maskTexture, this.size, this.size, this.mask);
  }

  /** Inject `current` (du/dt units) inside `shape` for `durationMs` of simulated time. */
  stimulate(shape: StimulusShape, current: number, durationMs: number): void {
    this.stimulus = { shape, current, remainingMs: durationMs };
  }

  /** Start an antitachycardia pacing burst; replaces any burst in progress. */
  startPacing(config: PacingConfig): void {
    this.lastPacingConfig = config;
    this.pacing = startPacing(config, this._timeMs);
  }

  stopPacing(): void {
    this.pacing = null;
  }

  get isPacing(): boolean {
    return this.pacing !== null;
  }

  /** Fibre direction and conductivity ratio; ratio 1 is the isotropic 9-point stencil. */
  setFibres(fibres: Fibres): void {
    this.fibres = fibres;
  }

  get currentFibres(): Fibres {
    return this.fibres;
  }

  /** Uniform transmembrane current everywhere for `durationMs`: the defibrillation shock. */
  applyShock(current: number, durationMs: number): void {
    this.shock = { current, remainingMs: durationMs };
  }

  get isStimulating(): boolean {
    return this.stimulus !== null;
  }

  get isShocking(): boolean {
    return this.shock !== null;
  }

  step(count: number): void {
    const { gl } = this;
    const p = this.preset.params;
    const dt = this.preset.dt;
    gl.useProgram(this.stepProgram.handle);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.size, this.size);
    this.setParamUniforms(p, dt);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.uniform1i(this.stepProgram.uniform('uMask'), 1);
    gl.uniform1i(this.stepProgram.uniform('uState'), 0);
    gl.activeTexture(gl.TEXTURE0);

    for (let i = 0; i < count; i++) {
      this.firePacingIfDue();
      this.setStimulusUniforms();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.state.write.framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, this.state.read.texture);
      drawFullscreen(gl);
      this.state.swap();
      this.advanceSchedule(dt);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private firePacingIfDue(): void {
    if (!this.pacing) return;
    const { fire, state } = advancePacing(this.pacing, this._timeMs);
    this.pacing = state;
    if (fire) {
      const { site, current, durationMs } = this.lastPacingConfig!;
      this.stimulus = { shape: { kind: 'ellipse', ...site }, current, remainingMs: durationMs };
    }
  }

  private setParamUniforms(p: FkParams, dt: number): void {
    const { gl } = this;
    const u = this.stepProgram.uniform.bind(this.stepProgram);
    gl.uniform2f(u('uTexel'), 1 / this.size, 1 / this.size);
    gl.uniform1f(u('uDt'), dt);
    const dx2 = this.dx * this.dx;
    const tensor = diffusionTensor(this.preset.diffusion, this.fibres);
    gl.uniform1f(u('uDiffOverDx2'), this.preset.diffusion / dx2);
    gl.uniform1i(u('uAnisotropic'), this.fibres.ratio !== 1 ? 1 : 0);
    gl.uniform3f(u('uTensorOverDx2'), tensor.dxx / dx2, tensor.dxy / dx2, tensor.dyy / dx2);
    gl.uniform1f(u('invTauVPlus'), invRate(p.tauVPlus));
    gl.uniform1f(u('invTauVMinusLow'), invRate(p.tauVMinusLow));
    gl.uniform1f(u('invTauVMinusHigh'), invRate(p.tauVMinusHigh));
    gl.uniform1f(u('invTauWPlus'), invRate(p.tauWPlus));
    gl.uniform1f(u('invTauWMinus'), invRate(p.tauWMinus));
    gl.uniform1f(u('invTauD'), invRate(p.tauD));
    gl.uniform1f(u('invTau0'), invRate(p.tau0));
    gl.uniform1f(u('invTauR'), invRate(p.tauR));
    gl.uniform1f(u('invTauSi'), invRate(p.tauSi));
    gl.uniform1f(u('kSi'), p.k);
    gl.uniform1f(u('uCsi'), p.uCsi);
    gl.uniform1f(u('uC'), p.uC);
    gl.uniform1f(u('uV'), p.uV);
  }

  private setStimulusUniforms(): void {
    const { gl } = this;
    const u = this.stepProgram.uniform.bind(this.stepProgram);
    const s = this.stimulus;
    if (!s) {
      gl.uniform1i(u('uStimKind'), 0);
      gl.uniform1f(u('uStimCurrent'), 0);
    } else if (s.shape.kind === 'rect') {
      gl.uniform1i(u('uStimKind'), 1);
      gl.uniform4f(u('uStimShape'), s.shape.x0, s.shape.y0, s.shape.x1, s.shape.y1);
      gl.uniform1f(u('uStimCurrent'), s.current);
    } else {
      gl.uniform1i(u('uStimKind'), 2);
      gl.uniform4f(u('uStimShape'), s.shape.cx, s.shape.cy, s.shape.rx, s.shape.ry);
      gl.uniform1f(u('uStimCurrent'), s.current);
    }
    gl.uniform1f(u('uShockCurrent'), this.shock?.current ?? 0);
  }

  private advanceSchedule(dt: number): void {
    this._timeMs += dt;
    this._steps += 1;
    if (this.stimulus) {
      const remainingMs = this.stimulus.remainingMs - dt;
      this.stimulus = remainingMs > 0 ? { ...this.stimulus, remainingMs } : null;
    }
    if (this.shock) {
      const remainingMs = this.shock.remainingMs - dt;
      this.shock = remainingMs > 0 ? { ...this.shock, remainingMs } : null;
    }
  }

  /** Draw the current state to the default framebuffer. */
  render(view: ViewMode, width: number, height: number): void {
    const { gl } = this;
    gl.useProgram(this.renderProgram.handle);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    const u = this.renderProgram.uniform.bind(this.renderProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state.read.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.voltageLut);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.phaseLut);
    gl.uniform1i(u('uState'), 0);
    gl.uniform1i(u('uMask'), 1);
    gl.uniform1i(u('uVoltageLut'), 2);
    gl.uniform1i(u('uPhaseLut'), 3);
    gl.uniform1i(u('uView'), VIEW_INDEX[view]);
    gl.uniform2f(u('uResolution'), width, height);
    drawFullscreen(gl);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * Downsample the state to PROBE_SIZE² and read it back.
   * Layout per texel: [mean u, max u, mean v, tissue count].
   * Synchronous: stalls until the GPU finishes. Used by tests and by the
   * asynchronous path's first sample.
   */
  probe(): Float32Array {
    const { gl } = this;
    this.drawProbe();
    gl.readPixels(0, 0, PROBE_SIZE, PROBE_SIZE, gl.RGBA, gl.FLOAT, this.probeBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    return this.probeBuffer;
  }

  /**
   * Non-blocking probe. Issues the downsample and a readback into a pixel
   * buffer guarded by a fence; returns the previous completed readback (or
   * null until one has landed). Latency is one frame, which the ECG and the
   * S1-S2 timing tolerate; the stall of a synchronous read does not.
   */
  probeAsync(): ProbeResult | null {
    const { gl } = this;
    let result: ProbeResult | null = null;
    if (this.probeFence) {
      const status = gl.clientWaitSync(this.probeFence, 0, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
        gl.deleteSync(this.probeFence);
        this.probeFence = null;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.probePbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.probeBuffer);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        result = { data: this.probeBuffer, timeMs: this.probeIssuedAtMs };
      } else {
        // Previous readback still in flight: do not queue another.
        return null;
      }
    }
    this.drawProbe();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.probePbo);
    gl.readPixels(0, 0, PROBE_SIZE, PROBE_SIZE, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.probeFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.probeIssuedAtMs = this._timeMs;
    gl.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    return result;
  }

  /** Timing of the probe readback strategies, for performance work. */
  benchmarkProbe(iterations = 20): Record<string, number> {
    const { gl } = this;
    const time = (fn: () => void) => {
      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) fn();
      return +((performance.now() - t0) / iterations).toFixed(3);
    };
    const out: Record<string, number> = {};
    out.drawThenRead = time(() => {
      this.drawProbe();
      gl.readPixels(0, 0, PROBE_SIZE, PROBE_SIZE, gl.RGBA, gl.FLOAT, this.probeBuffer);
    });
    out.drawFinishRead = time(() => {
      this.drawProbe();
      gl.finish();
      gl.readPixels(0, 0, PROBE_SIZE, PROBE_SIZE, gl.RGBA, gl.FLOAT, this.probeBuffer);
    });
    out.stepsThenProbe = time(() => {
      this.step(100);
      this.probe();
    });
    out.stepsFinishProbe = time(() => {
      this.step(100);
      gl.finish();
      this.probe();
    });
    out.stepsThenProbeAsync = time(() => {
      this.step(100);
      this.probeAsync();
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  private drawProbe(): void {
    const { gl } = this;
    gl.useProgram(this.probeProgram.handle);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.probeTarget.framebuffer);
    gl.viewport(0, 0, PROBE_SIZE, PROBE_SIZE);
    const u = this.probeProgram.uniform.bind(this.probeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state.read.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.uniform1i(u('uState'), 0);
    gl.uniform1i(u('uMask'), 1);
    gl.uniform1i(u('uBlock'), Math.max(1, Math.floor(this.size / PROBE_SIZE)));
    gl.uniform2f(u('uTexel'), 1 / this.size, 1 / this.size);
    drawFullscreen(gl);
  }

  /** Full-resolution readback of (u, v, w, 1) per cell. Slow; for tests and export. */
  readState(): Float32Array {
    const { gl } = this;
    const out = new Float32Array(this.size * this.size * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.state.read.framebuffer);
    gl.readPixels(0, 0, this.size, this.size, gl.RGBA, gl.FLOAT, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }
}

/** Every cell at rest; alpha carries the mask so the step shader's neighbour fetch sees it. */
function restState(size: number, mask: Uint8Array): Float32Array {
  const data = new Float32Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = REST.u;
    data[i * 4 + 1] = REST.v;
    data[i * 4 + 2] = REST.w;
    data[i * 4 + 3] = mask[i] ? 1 : 0;
  }
  return data;
}
