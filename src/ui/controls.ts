import type { AppController } from '../app/controller';
import { PRESETS } from '../model/presets';
import type { ViewMode } from '../gpu/simulation';
import type { Tool } from '../app/controller';
import { EcgTrace } from '../ecg/EcgTrace';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html is missing #${id}`);
  return el as T;
}

export interface Controls {
  readonly update: () => void;
}

export function bindControls(app: AppController, shareUrl: () => string): Controls {
  const share = byId<HTMLButtonElement>('share');
  const shareStatus = byId<HTMLElement>('share-status');
  share.addEventListener('click', async () => {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      shareStatus.textContent = 'Link copied';
    } catch {
      shareStatus.textContent = url;
    }
    window.setTimeout(() => {
      shareStatus.textContent = '';
    }, 4000);
  });

  const presetSelect = byId<HTMLSelectElement>('preset');
  const presetNote = byId<HTMLElement>('preset-note');
  for (const p of PRESETS) {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    presetSelect.append(option);
  }
  presetSelect.value = app.preset.id;
  presetNote.textContent = app.preset.description;
  presetSelect.addEventListener('change', () => {
    app.setPreset(presetSelect.value);
    presetNote.textContent = app.preset.description;
  });

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

  const shockStrength = byId<HTMLInputElement>('shock-strength');
  const shockValue = byId<HTMLElement>('shock-value');
  const syncShock = () => {
    app.shockCurrent = Number(shockStrength.value);
    shockValue.textContent = app.shockCurrent.toFixed(2);
  };
  shockStrength.addEventListener('input', syncShock);
  syncShock();

  const speed = byId<HTMLInputElement>('speed');
  const speedValue = byId<HTMLElement>('speed-value');
  const syncSpeed = () => {
    app.stepsPerFrame = Number(speed.value);
    speedValue.textContent = String(app.stepsPerFrame);
  };
  speed.addEventListener('input', syncSpeed);
  syncSpeed();

  const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-tool]'));
  const syncTool = () => {
    for (const b of toolButtons)
      b.setAttribute('aria-pressed', String(b.dataset.tool === app.tool));
    byId<HTMLCanvasElement>('tissue').dataset.tool = app.tool;
  };
  for (const b of toolButtons) {
    b.addEventListener('click', () => {
      app.tool = b.dataset.tool as Tool;
      syncTool();
    });
  }
  syncTool();

  const brush = byId<HTMLInputElement>('brush');
  const brushValue = byId<HTMLElement>('brush-value');
  const syncBrush = () => {
    app.brushRadius = Number(brush.value);
    brushValue.textContent = `${(app.brushRadius * app.sim.sideCm * 10).toFixed(0)} mm`;
  };
  brush.addEventListener('input', syncBrush);
  syncBrush();
  byId<HTMLButtonElement>('scar-patch').addEventListener('click', () => app.presetScar());
  byId<HTMLButtonElement>('scar-clear').addEventListener('click', () => app.clearScar());

  const ecg = new EcgTrace(byId<HTMLCanvasElement>('ecg'));
  const styles = getComputedStyle(document.documentElement);
  const traceColor = styles.getPropertyValue('--color-trace').trim() || '#8f8';
  const gridColor = styles.getPropertyValue('--color-grid').trim() || '#333';
  let lastEcgT = -1;

  const view = byId<HTMLSelectElement>('view');
  view.value = app.view;
  view.addEventListener('change', () => {
    app.view = view.value as ViewMode;
  });

  const hudTime = byId<HTMLElement>('hud-time');
  const hudRate = byId<HTMLElement>('hud-rate');
  const hudStatus = byId<HTMLElement>('hud-status');
  let msAccum = 0;
  let frames = 0;
  let lastRateUpdate = performance.now();
  let rateText = '—';

  const update = () => {
    if (app.lastEcg && app.lastEcg.t !== lastEcgT) {
      ecg.push(app.lastEcg);
      lastEcgT = app.lastEcg.t;
    } else if (!app.lastEcg && lastEcgT >= 0) {
      ecg.clear();
      lastEcgT = -1;
    }
    ecg.draw(traceColor, gridColor);
    hudTime.textContent = `${(app.sim.timeMs / 1000).toFixed(2)} s`;
    msAccum += app.lastTickMs;
    frames++;
    const now = performance.now();
    if (now - lastRateUpdate > 500) {
      const simMsPerRealS = (msAccum / (now - lastRateUpdate)) * 1000;
      rateText = `${Math.round(simMsPerRealS)} ms/s`;
      msAccum = 0;
      frames = 0;
      lastRateUpdate = now;
    }
    hudRate.textContent = rateText;
    hudStatus.textContent = app.status;
    hudStatus.dataset.status = app.status;
  };
  void frames;
  return { update };
}
