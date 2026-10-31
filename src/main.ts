import { AppController } from './app/controller';
import { createContext, GpuUnsupportedError } from './gpu/context';
import { Simulation } from './gpu/simulation';
import { presetById } from './model/presets';
import { decodeUrlState, encodeUrlState } from './state/urlState';
import { bindControls } from './ui/controls';
import { bindHud } from './ui/hud';
import { bindTour } from './ui/tour';
import { bindKeyboard } from './ui/keyboard';
import { bindPointer } from './ui/pointer';
import './styles/tokens.css';
import './styles/global.css';

const params = new URLSearchParams(location.search);
const isTest = params.get('test') === '1';
const urlState = decodeUrlState(location.search);
// Tests may ask for tiny grids that are not offered in the UI.
const testSize = Number(params.get('n'));
const size =
  isTest && Number.isInteger(testSize) && testSize >= 16 && testSize <= 1024
    ? testSize
    : urlState.n;

const canvas = document.querySelector<HTMLCanvasElement>('#tissue');
const fallback = document.querySelector<HTMLElement>('#unsupported');
if (!canvas || !fallback) throw new Error('index.html is missing #tissue or #unsupported');

function showUnsupported(message: string): void {
  fallback!.hidden = false;
  fallback!.querySelector('p')!.textContent = message;
  canvas!.hidden = true;
}

function resize(c: HTMLCanvasElement): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const side = Math.round(Math.min(c.clientWidth, c.clientHeight) * dpr);
  if (side > 0 && (c.width !== side || c.height !== side)) {
    c.width = side;
    c.height = side;
  }
}

try {
  const { gl } = createContext(canvas);
  const sim = new Simulation(gl, presetById(urlState.preset), size);
  sim.setDx(urlState.dx);
  const app = new AppController(sim, urlState.strokes, urlState.fibres);
  app.view = urlState.view;
  // Respect reduced motion: load paused, with the Run button to opt in.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  app.running = !isTest && !reducedMotion;

  const shareUrl = () =>
    `${location.origin}${location.pathname}${encodeUrlState({
      preset: app.preset.id,
      n: size,
      dx: sim.dx,
      view: app.view,
      strokes: app.strokes,
      fibres: app.fibres,
    })}`;

  const controls = bindControls(app, shareUrl);
  const hud = bindHud(app, canvas);
  bindTour(app);

  // A shared link should be moving within a second. Reduced motion opts out.
  const AUTO_INDUCE_DELAY_MS = 700;
  if (!isTest && !reducedMotion) window.setTimeout(() => app.induce(), AUTO_INDUCE_DELAY_MS);
  bindKeyboard(app, controls.syncPause);
  bindPointer(canvas, app);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      app.running = false;
      controls.syncPause();
    }
  });

  const sheetSelect = document.querySelector<HTMLSelectElement>('#sheet');
  if (sheetSelect) {
    const value = `${size}@${sim.dx}`;
    if (!Array.from(sheetSelect.options).some((o) => o.value === value)) {
      const custom = document.createElement('option');
      custom.value = value;
      custom.textContent = `${(size * sim.dx).toFixed(1)} cm · ${(sim.dx * 10).toFixed(2)} mm grid (from URL)`;
      sheetSelect.append(custom);
    }
    sheetSelect.value = value;
    sheetSelect.addEventListener('change', () => {
      const [n, dx] = sheetSelect.value.split('@');
      const next = new URLSearchParams(location.search);
      next.set('n', n ?? '512');
      next.set('dx', dx ?? '0.04');
      next.delete('test');
      location.search = next.toString();
    });
  }

  // Auto-throttle: if frames keep taking longer than ~25 ms, halve the work per
  // frame (down to 1 ms) so slower GPUs stay smooth. Users can raise it back.
  const SLOW_FRAME_MS = 25;
  const SLOW_FRAMES_BEFORE_THROTTLE = 12;
  const MIN_MS_PER_FRAME = 1;
  let slowFrames = 0;
  let lastFrameAt = performance.now();

  // ?stats=1 accumulates per-phase frame timings on window.__frameStats.
  const stats = params.get('stats') === '1' ? { frames: 0, tick: 0, render: 0, hud: 0 } : null;
  if (stats) (window as unknown as { __frameStats: typeof stats }).__frameStats = stats;

  const frame = (now: number) => {
    const elapsed = now - lastFrameAt;
    lastFrameAt = now;
    if (app.running && elapsed > SLOW_FRAME_MS && app.msPerFrame > MIN_MS_PER_FRAME) {
      if (++slowFrames >= SLOW_FRAMES_BEFORE_THROTTLE) {
        controls.setMsPerFrame(Math.max(MIN_MS_PER_FRAME, Math.floor(app.msPerFrame / 2)));
        slowFrames = 0;
      }
    } else {
      slowFrames = 0;
    }
    resize(canvas);
    const t0 = performance.now();
    app.tick();
    const t1 = performance.now();
    app.render(canvas.width, canvas.height);
    const t2 = performance.now();
    hud.update();
    if (stats) {
      stats.frames++;
      stats.tick += t1 - t0;
      stats.render += t2 - t1;
      stats.hud += performance.now() - t2;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (isTest) {
    const { installTestHook } = await import('./testHook');
    installTestHook(app);
  }
} catch (err) {
  if (err instanceof GpuUnsupportedError) {
    showUnsupported(err.message);
  } else {
    showUnsupported('The simulation failed to start. See the console for details.');
    console.error(err);
  }
}
