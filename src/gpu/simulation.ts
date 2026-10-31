/**
 * GPU Fenton-Karma sheet: owns the ping-pong state textures, the mask, the
 * step/render/probe programs and the stimulus/shock schedule.
 */
import { REST, type FkParams } from '../model/fentonKarma';
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

  private preset: Preset;
  private stimulus: Stimulus | null = null;
  private shock: Shock | null = null;
  private _timeMs = 0;
  private _steps = 0;

  constructor(gl: WebGL2RenderingContext, preset: Preset, size: number) {
    this.gl = gl;
    this.size = size;
    this.preset = preset;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('createVertexArray returned null');
    this.vao = vao;
    this.state = new PingPong(gl, size, size, restState(size));
    this.maskTexture = createMaskTexture(gl, size, size, new Uint8Array(size * size).fill(1));
    this.probeTarget = createFloatTarget(gl, PROBE_SIZE, PROBE_SIZE);
    this.probeBuffer = new Float32Array(PROBE_SIZE * PROBE_SIZE * 4);
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

  /** Return every cell to rest, keeping the mask. */
  reset(): void {
    uploadFloatTarget(this.gl, this.state.read, restState(this.size));
    uploadFloatTarget(this.gl, this.state.write, restState(this.size));
    this.stimulus = null;
    this.shock = null;
    this._timeMs = 0;
    this._steps = 0;
  }

  setMask(mask: Uint8Array): void {
    if (mask.length !== this.size * this.size) {
      throw new Error(`mask has ${mask.length} cells, expected ${this.size * this.size}`);
    }
    uploadMaskTexture(this.gl, this.maskTexture, this.size, this.size, mask);
  }

  /** Inject `current` (du/dt units) inside `shape` for `durationMs` of simulated time. */
  stimulate(shape: StimulusShape, current: number, durationMs: number): void {
    this.stimulus = { shape, current, remainingMs: durationMs };
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
      this.setStimulusUniforms();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.state.write.framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, this.state.read.texture);
      drawFullscreen(gl);
      this.state.swap();
      this.advanceSchedule(dt);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private setParamUniforms(p: FkParams, dt: number): void {
    const { gl } = this;
    const u = this.stepProgram.uniform.bind(this.stepProgram);
    gl.uniform2f(u('uTexel'), 1 / this.size, 1 / this.size);
    gl.uniform1f(u('uDt'), dt);
    gl.uniform1f(u('uDiffOverDx2'), this.preset.diffusion / (this.preset.dx * this.preset.dx));
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
   */
  probe(): Float32Array {
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
    gl.readPixels(0, 0, PROBE_SIZE, PROBE_SIZE, gl.RGBA, gl.FLOAT, this.probeBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    return this.probeBuffer;
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

function restState(size: number): Float32Array {
  const data = new Float32Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = REST.u;
    data[i * 4 + 1] = REST.v;
    data[i * 4 + 2] = REST.w;
    data[i * 4 + 3] = 1;
  }
  return data;
}
