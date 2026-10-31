import { createContext, GpuUnsupportedError } from './gpu/context';
import { Simulation } from './gpu/simulation';
import { DEFAULT_PRESET_ID, presetById } from './model/presets';
import './styles/tokens.css';
import './styles/global.css';

const params = new URLSearchParams(location.search);
const isTest = params.get('test') === '1';
const requestedSize = Number(params.get('n'));
const size =
  Number.isInteger(requestedSize) && requestedSize >= 16 && requestedSize <= 1024
    ? requestedSize
    : 512;

const canvas = document.querySelector<HTMLCanvasElement>('#tissue');
const fallback = document.querySelector<HTMLElement>('#unsupported');
if (!canvas || !fallback) throw new Error('index.html is missing #tissue or #unsupported');

function showUnsupported(message: string): void {
  fallback!.hidden = false;
  fallback!.querySelector('p')!.textContent = message;
  canvas!.hidden = true;
}

try {
  const { gl } = createContext(canvas);
  const sim = new Simulation(gl, presetById(params.get('preset') ?? DEFAULT_PRESET_ID), size);
  let running = !isTest;
  let stepsPerFrame = 10;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const side = Math.round(Math.min(canvas.clientWidth, canvas.clientHeight) * dpr);
    if (canvas.width !== side || canvas.height !== side) {
      canvas.width = side;
      canvas.height = side;
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = 1 - (e.clientY - rect.top) / rect.height;
    sim.stimulate({ kind: 'ellipse', cx, cy, rx: 0.03, ry: 0.03 }, 0.5, 2);
  });

  const frame = () => {
    resize();
    if (running) sim.step(stepsPerFrame);
    sim.render('voltage', canvas.width, canvas.height);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (isTest) {
    const { installTestHook } = await import('./testHook');
    installTestHook(
      sim,
      (id) => sim.setPreset(presetById(id)),
      () => {
        running = false;
        stepsPerFrame = 0;
      },
    );
  }
} catch (err) {
  if (err instanceof GpuUnsupportedError) {
    showUnsupported(err.message);
  } else {
    showUnsupported('The simulation failed to start. See the console for details.');
    console.error(err);
  }
}
