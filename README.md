# Reentry

**Cardiac arrhythmia on a grid.** A three-variable Fenton-Karma model of heart muscle, solved on the GPU in your browser. Induce a spiral wave the way a ventricular tachycardia starts, watch it break up into fibrillation, paint scar and see the rotor anchor to it, then try to defibrillate.

**Live:** https://27jackson08.github.io/reentry/

![A stable rotor in parameter set 8](docs/screenshots/rotor-set8.png)

## What you are looking at

A 20 cm square of simulated ventricular tissue, 512 cells on a side. Colour is membrane voltage: black is resting, pale is depolarized. Every frame the GPU advances the model by several time steps; a step is 0.1 ms of simulated time.

1. **Induce spiral.** An S1 stimulus launches a plane wave from the left edge. When that wave's tail reaches the middle of the sheet, an S2 stimulus fires into the lower-left quadrant. Half of S2's front runs into tissue that is still refractory and dies; the other half propagates. The free end curls into a rotor. This cross-field S1-S2 protocol is how reentry is started in real experiments.
2. **Watch.** Some parameter sets hold a single stable rotor (monomorphic tachycardia). Others break up into many wavelets (fibrillation). The pseudo-ECG under the sheet turns regular or chaotic accordingly.
3. **Scar.** Switch the brush to Scar and paint, or press _Scar patch_. Scar does not conduct. A rotor that wanders will anchor to it and turn around it.
4. **Shock.** A uniform current pulse across the whole sheet. Sweep the strength: weak shocks fail or re-induce, strong ones terminate. Find the threshold.
5. **Share.** The link encodes preset, grid, view and your scar strokes.

Keyboard: `I` induce, `W` plane wave, `S` shock, `R` reset, `space` pause. Click the tissue to stimulate a spot.

## The science

The model is Fenton & Karma (1998). Three variables per cell: a voltage and two gates. Three currents: fast inward, slow outward, slow inward. It is fit to reproduce action potential shape, restitution and conduction velocity of larger ionic models, and it produces the real phenomenology: spiral waves, breakup, anchoring, defibrillation thresholds.

Parameter sets are Table I of Fenton, Cherry, Hastings & Evans (2002) plus MLR-I from 1998, with sources and the three transcription discrepancies recorded in [docs/PHYSICS.md](docs/PHYSICS.md). Every set's APD90, conduction velocity and restitution curve, measured on this implementation, are in [docs/validation.md](docs/validation.md).

What is checked, automatically:

- The GPU shader and a TypeScript reference solver agree cell for cell (Playwright, headless WebGL).
- Rest is a fixed point; threshold behaviour; APD restitution is monotone; conduction velocity is physiological; scar blocks conduction; a closed no-flux boundary leaks nothing.
- S1-S2 produces sustained reentry; a strong shock ends it; a weak one does not.

What is simplified, deliberately: a flat isotropic sheet, no fibre direction, no anatomy, a monodomain shock, and a default grid spacing 60 % coarser than the papers' (costing about 7 % in conduction velocity, documented in the physics notes, with the reference spacing one click away).

## Running it

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # Playwright, needs: npx playwright install chromium
npm run validate     # regenerates docs/validation.md (slow)
npm run build        # dist/
```

Requires WebGL2 with `EXT_color_buffer_float` (every desktop browser; iOS 15+).

## Layout

```
src/model/      Fenton-Karma equations, presets, CPU reference solver, measures
src/gpu/        WebGL2 context, textures, step/render/probe shaders, Simulation
src/protocol/   S1-S2 state machine, scar strokes, probe statistics
src/ecg/        pseudo-ECG and the scope renderer
src/app/        AppController: ties simulation, protocol, probe and ECG together
src/ui/         controls, pointer, keyboard
src/state/      URL state
tests/          Vitest unit tests;  e2e/  Playwright
docs/           PHYSICS.md, validation.md, screenshots
scripts/        survey and screenshot helpers
```

## References

- Fenton F, Karma A. Vortex dynamics in three-dimensional continuous myocardium with fiber rotation: filament instability and fibrillation. _Chaos_ 8:20 (1998). doi:10.1063/1.166311
- Fenton FH, Cherry EM, Hastings HM, Evans SJ. Multiple mechanisms of spiral wave breakup in a model of cardiac electrical activity. _Chaos_ 12:852 (2002). doi:10.1063/1.1504242
- Plonsey R, Barr RC. _Bioelectricity: A Quantitative Approach_, for the pseudo-ECG integral.

Companion projects: [Cardio-filter](https://github.com/27jackson08/Cardio-filter) (heart-sound filtering) and [Respira](https://github.com/27jackson08/Respira) (respiratory rate from PPG).

MIT licence.
