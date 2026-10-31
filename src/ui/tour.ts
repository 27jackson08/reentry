/**
 * Guided tour: five steps from a plane wave to defibrillation, each one
 * action on the controller and one sentence of physiology.
 */
import type { AppController } from '../app/controller';

interface TourStep {
  readonly title: string;
  readonly text: string;
  readonly run: (app: AppController) => void;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    title: '1 · A normal beat',
    text: 'One stimulus at the left edge. The wave crosses the sheet once and dies at the far edge, as a sinus beat should: every cell fires, then rests.',
    run: (app) => {
      app.setPreset('set1');
      app.reset();
      app.planeWave();
    },
  },
  {
    title: '2 · Induce reentry',
    text: 'A second stimulus timed into the wake of the first. Half of it meets refractory tissue and blocks; the other half propagates. The free end curls into a rotor. This is how ventricular tachycardia starts.',
    run: (app) => {
      app.reset();
      app.induce();
    },
  },
  {
    title: '3 · Monomorphic tachycardia',
    text: 'The rotor drives the whole sheet at its own period. Look at the ECG: regular, fast, every beat the same. The readout should say one rotor and a regular cycle near 395 ms.',
    run: () => {},
  },
  {
    title: '4 · Degeneration into fibrillation',
    text: 'Switch to the original Beeler-Reuter fit, whose action potential shortens steeply at fast rates. The rotor breaks into wavelets within seconds. The ECG turns irregular; the rotor count climbs.',
    run: (app) => {
      app.setPreset('set3');
      app.reset();
      app.induce();
    },
  },
  {
    title: '5 · Pace, then shock',
    text: 'Pacing a little faster than the rotor entrains the tissue. In this homogeneous sheet it resets the rotor rather than ending it, which is how antitachycardia pacing fails in the clinic too. The shock excites everything at once so nothing is left to invade. Try both, then sweep the shock strength: the threshold is sharp, near 0.035.',
    run: (app) => {
      app.pace();
    },
  },
];

export function bindTour(app: AppController): void {
  const panel = document.getElementById('tour');
  const title = document.getElementById('tour-title');
  const text = document.getElementById('tour-text');
  const next = document.getElementById('tour-next');
  const close = document.getElementById('tour-close');
  const open = document.getElementById('tour-open');
  if (!panel || !title || !text || !next || !close || !open) return;
  let index = -1;

  const show = (i: number) => {
    index = i;
    const step = TOUR_STEPS[i];
    if (!step) {
      panel.hidden = true;
      index = -1;
      return;
    }
    panel.hidden = false;
    title.textContent = step.title;
    text.textContent = step.text;
    next.textContent = i === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';
    step.run(app);
  };

  open.addEventListener('click', () => show(0));
  next.addEventListener('click', () => show(index + 1));
  close.addEventListener('click', () => show(TOUR_STEPS.length));
}
