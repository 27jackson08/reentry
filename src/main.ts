import { AppController } from './app/controller';
import { createContext, GpuUnsupportedError } from './gpu/context';
import { Simulation } from './gpu/simulation';
import { presetById } from './model/presets';
import { decodeUrlState, encodeUrlState } from './state/urlState';
import { bindControls } from './ui/controls';
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
  const app = new AppController(sim, urlState.strokes);
  app.view = urlState.view;
  app.running = !isTest;

  const shareUrl = () =>
    `${location.origin}${location.pathname}${encodeUrlState({
      preset: app.preset.id,
      n: size,
      dx: sim.dx,
      view: app.view,
      strokes: app.strokes,
    })}`;

  const controls = bindControls(app, shareUrl);
  bindKeyboard(app);
  bindPointer(canvas, app);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) app.running = false;
  });

  const sheetSelect = document.querySelector<HTMLSelectElement>('#sheet');
  if (sheetSelect) {
    sheetSelect.value = `${size}@${sim.dx}`;
    sheetSelect.addEventListener('change', () => {
      const [n, dx] = sheetSelect.value.split('@');
      const next = new URLSearchParams(location.search);
      next.set('n', n ?? '512');
      next.set('dx', dx ?? '0.04');
      next.delete('test');
      location.search = next.toString();
    });
  }

  const frame = () => {
    resize(canvas);
    app.tick();
    app.render(canvas.width, canvas.height);
    controls.update();
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
