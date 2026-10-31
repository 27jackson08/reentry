import type { AppController, Tool } from '../app/controller';
import { PRESETS } from '../model/presets';
import type { ViewMode } from '../gpu/simulation';

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
  bindShare(shareUrl);
  bindPresets(app);
  bindBrush(app);

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

function bindShare(shareUrl: () => string): void {
  const share = byId<HTMLButtonElement>('share');
  const status = byId<HTMLElement>('share-status');
  share.addEventListener('click', async () => {
    const url = shareUrl();
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
