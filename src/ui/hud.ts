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
  const scaleBar = byId<HTMLElement>('scale-bar');
  const scaleLabel = byId<HTMLElement>('scale-label');
  const legend = byId<HTMLElement>('legend-bar');
  const flash = byId<HTMLElement>('shock-flash');
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

    const px = (SCALE_BAR_CM / app.sim.sideCm) * canvas.clientWidth;
    scaleBar.style.width = `${Math.round(px)}px`;

    if (app.shockCount !== seenShocks) {
      seenShocks = app.shockCount;
      flash.classList.add('active');
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => flash.classList.remove('active'), FLASH_MS);
    }
  };
  return { update };
}
