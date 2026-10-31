/**
 * The instrument strip and canvas overlays: time, speed, rhythm, status,
 * scale bar, colour legend, shock flash, and the ECG scope.
 */
import { ECG_WINDOW_MS, type AppController } from '../app/controller';
import { cssGradient, VOLTAGE_STOPS } from '../color/colormap';
import { EcgTrace } from '../ecg/EcgTrace';
import { analyzeRhythm } from '../ecg/rhythm';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html is missing #${id}`);
  return el as T;
}

const SCALE_BAR_CM = 5;
const RATE_WINDOW_MS = 500;
const RHYTHM_EVERY_N_FRAMES = 6;
const REGULAR_THRESHOLD = 0.65;
const RHYTHM_WINDOW_MS = 2500;
const RHYTHM_SMOOTHING = 3;
const FLASH_MS = 260;
const NARRATION_LINGER_MS = 2500;
const NARRATION: Record<string, string> = {
  awaitUpstroke: 'S1 · plane wave launched from the left edge',
  awaitWaveBack: 'S1 · waiting for the wave back to reach mid-sheet',
  awaitRecovery: 'S1 · waiting for the wave back to reach mid-sheet',
  done: 'S2 · fired into the wake: half blocks, half conducts, the free end curls',
  failed: 'Induction failed: no wave reached the probe',
};

/** Median of the recent evaluations, so the label does not flicker frame to frame. */
function describeRhythm(recent: ({ cycleMs: number; regularity: number } | null)[]): string {
  const valid = recent.filter((r): r is { cycleMs: number; regularity: number } => r !== null);
  if (valid.length === 0) return '—';
  const sorted = [...valid].sort((a, b) => a.regularity - b.regularity);
  const mid = sorted[Math.floor(sorted.length / 2)]!;
  const cycles = [...valid].sort((a, b) => a.cycleMs - b.cycleMs);
  const cycle = cycles[Math.floor(cycles.length / 2)]!.cycleMs;
  return `${cycle} ms · ${mid.regularity >= REGULAR_THRESHOLD ? 'regular' : 'irregular'}`;
}

/** Rings at each phase singularity, on a transparent canvas over the tissue. */
function drawTips(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D | null,
  rotors: readonly { x: number; y: number; charge: number }[],
  color: string,
): void {
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (w === 0 || h === 0) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.clearRect(0, 0, w, h);
  if (rotors.length === 0) return;
  const radius = Math.max(4, w * 0.012);
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeStyle = color;
  for (const r of rotors) {
    const cx = r.x * w;
    const cy = (1 - r.y) * h;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();
    // A short tick shows the sense of rotation.
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      radius * 1.8,
      r.charge > 0 ? -Math.PI / 2 : Math.PI / 2,
      r.charge > 0 ? 0 : Math.PI,
    );
    ctx.stroke();
  }
}

export interface Hud {
  readonly update: () => void;
}

export function bindHud(app: AppController, canvas: HTMLCanvasElement): Hud {
  const ecg = new EcgTrace(byId<HTMLCanvasElement>('ecg'), ECG_WINDOW_MS);
  const styles = getComputedStyle(document.documentElement);
  const traceColor = styles.getPropertyValue('--color-trace').trim() || '#8f8';
  const gridColor = styles.getPropertyValue('--color-grid').trim() || '#333';

  const hudTime = byId<HTMLElement>('hud-time');
  const hudRate = byId<HTMLElement>('hud-rate');
  const hudRhythm = byId<HTMLElement>('hud-rhythm');
  const hudStatus = byId<HTMLElement>('hud-status');
  const hudRotors = byId<HTMLElement>('hud-rotors');
  const tips = byId<HTMLCanvasElement>('tips');
  const tipsCtx = tips.getContext('2d');
  const tipColor = styles.getPropertyValue('--color-tip').trim() || '#fff';
  const scaleBar = byId<HTMLElement>('scale-bar');
  const scaleLabel = byId<HTMLElement>('scale-label');
  const legend = byId<HTMLElement>('legend-bar');
  const flash = byId<HTMLElement>('shock-flash');
  const narration = byId<HTMLElement>('narration');
  legend.style.background = cssGradient(VOLTAGE_STOPS);
  scaleLabel.textContent = `${SCALE_BAR_CM} cm`;

  let msAccum = 0;
  let lastRateUpdate = performance.now();
  let rateText = '—';
  let frame = 0;
  let rhythmText = '—';
  const recent: ({ cycleMs: number; regularity: number } | null)[] = [];
  let seenShocks = app.shockCount;
  let flashTimer = 0;
  let lastPhase: string | null = null;
  let narrationTimer = 0;

  const update = () => {
    frame++;
    ecg.draw(app.ecgSamples, traceColor, gridColor);

    if (frame % RHYTHM_EVERY_N_FRAMES === 0) {
      const last = app.ecgSamples[app.ecgSamples.length - 1];
      const window = last ? app.ecgSamples.filter((s) => s.t > last.t - RHYTHM_WINDOW_MS) : [];
      recent.push(app.activity > 0 ? analyzeRhythm(window) : null);
      if (recent.length > RHYTHM_SMOOTHING) recent.shift();
      rhythmText = describeRhythm(recent);
    }

    hudTime.textContent = `${(app.sim.timeMs / 1000).toFixed(2)} s`;
    msAccum += app.lastTickMs;
    const now = performance.now();
    if (now - lastRateUpdate > RATE_WINDOW_MS) {
      const simMsPerRealS = (msAccum / (now - lastRateUpdate)) * 1000;
      rateText = `${(simMsPerRealS / 1000).toFixed(2)}×`;
      msAccum = 0;
      lastRateUpdate = now;
    }
    hudRate.textContent = app.running ? rateText : 'paused';
    hudRhythm.textContent = rhythmText;
    hudStatus.textContent = app.status;
    hudStatus.dataset.status = app.status;
    hudRotors.textContent = app.activity > 0 ? String(app.rotors.length) : '—';
    drawTips(tips, tipsCtx, app.rotors, tipColor);

    const px = (SCALE_BAR_CM / app.sim.sideCm) * canvas.clientWidth;
    scaleBar.style.width = `${Math.round(px)}px`;

    const phase = app.protocolPhase;
    if (phase !== lastPhase) {
      lastPhase = phase;
      window.clearTimeout(narrationTimer);
      narration.textContent = phase ? (NARRATION[phase] ?? '') : '';
      narration.classList.toggle('visible', phase !== null);
      if (phase === 'done' || phase === 'failed') {
        narrationTimer = window.setTimeout(
          () => narration.classList.remove('visible'),
          NARRATION_LINGER_MS,
        );
      }
    }

    if (app.shockCount !== seenShocks) {
      seenShocks = app.shockCount;
      flash.classList.add('active');
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => flash.classList.remove('active'), FLASH_MS);
    }
  };
  return { update };
}
