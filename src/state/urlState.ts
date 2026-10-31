/** Shareable scenario state in the query string, validated on the way in. */
import type { ViewMode } from '../gpu/simulation';
import { DEFAULT_PRESET_ID, PRESETS } from '../model/presets';
import { decodeStrokes, encodeStrokes, type Stroke } from '../protocol/scar';
import { ISOTROPIC, MAX_RATIO, type Fibres } from '../model/anisotropy';

export interface UrlState {
  readonly preset: string;
  readonly n: number;
  readonly dx: number;
  readonly view: ViewMode;
  readonly strokes: readonly Stroke[];
  readonly fibres: Fibres;
}

export const DEFAULT_URL_STATE: UrlState = {
  preset: DEFAULT_PRESET_ID,
  n: 512,
  dx: 0.04,
  view: 'voltage',
  strokes: [],
  fibres: ISOTROPIC,
};

const SIZES = new Set([128, 256, 512, 1024]);
const DX_MIN = 0.02;
const DX_MAX = 0.1;
const VIEWS: readonly ViewMode[] = ['voltage', 'phase', 'gates'];

export function decodeUrlState(search: string): UrlState {
  const q = new URLSearchParams(search);
  const preset = q.get('preset');
  const n = Number(q.get('n'));
  const dx = Number(q.get('dx'));
  const view = q.get('view');
  return {
    preset: preset && PRESETS.some((p) => p.id === preset) ? preset : DEFAULT_URL_STATE.preset,
    n: SIZES.has(n) ? n : DEFAULT_URL_STATE.n,
    dx: dx >= DX_MIN && dx <= DX_MAX ? dx : DEFAULT_URL_STATE.dx,
    view: VIEWS.includes(view as ViewMode) ? (view as ViewMode) : DEFAULT_URL_STATE.view,
    strokes: decodeStrokes(q.get('scar') ?? ''),
    fibres: decodeFibres(q.get('aniso'), q.get('angle')),
  };
}

function decodeFibres(ratioText: string | null, angleText: string | null): Fibres {
  const ratio = Number(ratioText);
  const angle = Number(angleText);
  return {
    ratio: ratio >= 1 && ratio <= MAX_RATIO ? ratio : ISOTROPIC.ratio,
    angleDeg:
      Number.isFinite(angle) && angleText !== null
        ? ((angle % 180) + 180) % 180
        : ISOTROPIC.angleDeg,
  };
}

export function encodeUrlState(state: UrlState): string {
  const q = new URLSearchParams();
  if (state.preset !== DEFAULT_URL_STATE.preset) q.set('preset', state.preset);
  if (state.n !== DEFAULT_URL_STATE.n) q.set('n', String(state.n));
  if (state.dx !== DEFAULT_URL_STATE.dx) q.set('dx', String(state.dx));
  if (state.view !== DEFAULT_URL_STATE.view) q.set('view', state.view);
  if (state.strokes.length > 0) q.set('scar', encodeStrokes(state.strokes));
  if (state.fibres.ratio !== 1) {
    q.set('aniso', String(state.fibres.ratio));
    if (state.fibres.angleDeg !== 0) q.set('angle', String(state.fibres.angleDeg));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
