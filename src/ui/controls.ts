import type { AppController, Tool } from '../app/controller';
import { PRESETS } from '../model/presets';
import type { ViewMode } from '../gpu/simulation';
import { maskFromImage } from '../protocol/scarImage';
import { createRecorder } from './recorder';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html is missing #${id}`);
  return el as T;
}

export interface Controls {
  /** Set simulated ms per frame from code (auto-throttle) and reflect it in the slider. */
  readonly setMsPerFrame: (ms: number) => void;
  readonly syncPause: () => void;
}

const SHARE_STATUS_MS = 4000;

export function bindControls(app: AppController, shareUrl: () => string): Controls {
  bindShare(shareUrl, app);
  bindPresets(app);
  bindBrush(app);
  bindFibres(app);
  bindRecorder();
  bindScarImage(app);

  byId<HTMLButtonElement>('induce').addEventListener('click', () => app.induce());
  byId<HTMLButtonElement>('plane').addEventListener('click', () => app.planeWave());
  byId<HTMLButtonElement>('shock').addEventListener('click', () => app.shock());
  byId<HTMLButtonElement>('reset').addEventListener('click', () => app.reset());

  const pause = byId<HTMLButtonElement>('pause');
  const syncPause = () => {
    pause.textContent = app.running ? 'Pause' : 'Run';
    pause.setAttribute('aria-pressed', String(!app.running));
  };
  pause.addEventListener('click', () => {
    app.running = !app.running;
    syncPause();
  });
  syncPause();

  bindSlider('shock-strength', 'shock-value', (v) => {
    app.shockCurrent = v;
    return v.toFixed(2);
  });

  byId<HTMLButtonElement>('pace').addEventListener('click', () => app.pace());
  bindSlider('pace-cycle', 'pace-value', (v) => {
    app.pacingCycleMs = v;
    return `${v} ms`;
  });

  const speed = byId<HTMLInputElement>('speed');
  const syncSpeed = bindSlider('speed', 'speed-value', (v) => {
    app.msPerFrame = v;
    return `${v} ms/frame`;
  });
  const setMsPerFrame = (ms: number) => {
    speed.value = String(ms);
    syncSpeed();
  };

  const view = byId<HTMLSelectElement>('view');
  view.value = app.view;
  view.addEventListener('change', () => {
    app.view = view.value as ViewMode;
  });

  return { setMsPerFrame, syncPause };
}

/** Wire a range input to a setter; the setter returns the display text. */
function bindSlider(
  inputId: string,
  outputId: string,
  apply: (value: number) => string,
): () => void {
  const input = byId<HTMLInputElement>(inputId);
  const output = byId<HTMLElement>(outputId);
  const sync = () => {
    output.textContent = apply(Number(input.value));
  };
  input.addEventListener('input', sync);
  sync();
  return sync;
}

function bindShare(shareUrl: () => string, app: AppController): void {
  const share = byId<HTMLButtonElement>('share');
  const status = byId<HTMLElement>('share-status');
  share.addEventListener('click', async () => {
    const url = shareUrl();
    if (app.maskFromImage) {
      status.textContent =
        'Image scars are not encoded in links; the link carries everything else.';
      window.setTimeout(() => {
        status.textContent = '';
      }, SHARE_STATUS_MS);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Link copied';
    } catch {
      status.textContent = url;
    }
    window.setTimeout(() => {
      status.textContent = '';
    }, SHARE_STATUS_MS);
  });
}

function bindPresets(app: AppController): void {
  const select = byId<HTMLSelectElement>('preset');
  const note = byId<HTMLElement>('preset-note');
  for (const p of PRESETS) {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    select.append(option);
  }
  select.value = app.preset.id;
  note.textContent = app.preset.description;
  select.addEventListener('change', () => {
    app.setPreset(select.value);
    note.textContent = app.preset.description;
  });
}

function bindFibres(app: AppController): void {
  const ratio = byId<HTMLInputElement>('fibre-ratio');
  const angle = byId<HTMLInputElement>('fibre-angle');
  ratio.value = String(app.fibres.ratio);
  angle.value = String(app.fibres.angleDeg);
  const apply = () => app.setFibres({ ratio: Number(ratio.value), angleDeg: Number(angle.value) });
  bindSlider('fibre-ratio', 'fibre-ratio-value', (v) => {
    apply();
    return v === 1 ? 'isotropic' : `${v}× (CV ×${Math.sqrt(v).toFixed(1)})`;
  });
  bindSlider('fibre-angle', 'fibre-angle-value', (v) => {
    apply();
    return `${v}°`;
  });
}

function bindRecorder(): void {
  const button = byId<HTMLButtonElement>('record');
  const link = byId<HTMLAnchorElement>('record-link');
  const recorder = createRecorder(byId<HTMLCanvasElement>('tissue'), (url, filename) => {
    link.href = url;
    link.download = filename;
    link.textContent = `Save ${filename}`;
    link.hidden = false;
  });
  if (!recorder.isSupported()) {
    button.disabled = true;
    button.title = 'Recording is not supported in this browser';
    return;
  }
  button.addEventListener('click', () => {
    if (recorder.isRecording()) {
      recorder.stop();
      button.textContent = 'Record clip';
      button.classList.remove('recording');
    } else {
      link.hidden = true;
      recorder.start();
      button.textContent = 'Stop recording';
      button.classList.add('recording');
    }
  });
}

function bindScarImage(app: AppController): void {
  const input = byId<HTMLInputElement>('scar-image');
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D context unavailable');
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      app.setMaskDirect(maskFromImage(data, bitmap.width, bitmap.height, app.sim.size));
    } catch (err) {
      console.error('Could not read scar image', err);
      byId<HTMLElement>('scar-image-status').textContent =
        'That file could not be read as an image.';
    } finally {
      input.value = '';
    }
  });
}

function bindBrush(app: AppController): void {
  const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-tool]'));
  const tissue = byId<HTMLCanvasElement>('tissue');
  const syncTool = () => {
    for (const b of toolButtons)
      b.setAttribute('aria-pressed', String(b.dataset.tool === app.tool));
    tissue.dataset.tool = app.tool;
  };
  for (const b of toolButtons) {
    b.addEventListener('click', () => {
      app.tool = b.dataset.tool as Tool;
      syncTool();
    });
  }
  syncTool();
  bindSlider('brush', 'brush-value', (v) => {
    app.brushRadius = v;
    return `${(v * app.sim.sideCm * 10).toFixed(0)} mm`;
  });
  byId<HTMLButtonElement>('scar-patch').addEventListener('click', () => app.presetScar());
  byId<HTMLButtonElement>('scar-clear').addEventListener('click', () => app.clearScar());
}
